import { createDecorator } from '../../instantiation/instantiation'
import { registerSingleton } from '../../instantiation/extensions'
import { Emitter, Event } from '../../base/event'
import type { IDisposable } from '../../base/lifecycle'
import { RPCProtocol, type IMessagePassingProtocol } from '../../../platform/rpc/rpcProtocol'
import {
  MainContext,
  ExtHostContext,
  type MainThreadCommandsShape,
  type MainThreadMessageShape,
  type ExtHostExtensionServiceShape,
  type ExtHostCommandsShape,
  type ExtensionDescription
} from '../../../platform/rpc/proxyIdentifiers'
import { extHostPortPromise } from '../../platform/extHostPort'
import { ICommandService } from '../commands/commandService'
import { INotificationService, type NotificationSeverity } from '../notification/notificationService'
import { IStorageService, StorageScope } from '../storage/storageService'

export interface GalleryItem {
  id: string
  displayName: string
  description: string
  publisher: string
  version: string
}

/** Merged view model for the Extensions sidebar */
export interface ExtensionViewModel {
  id: string
  displayName: string
  description: string
  publisher: string
  version: string
  installed: boolean
  enabled: boolean
}

export interface IExtensionService {
  readonly _serviceBrand: undefined

  /** Fires when installed/enabled state changes */
  readonly onDidChangeExtensions: Event<void>

  /** Connect to the ext host and register contributed commands — call once at startup */
  start(): Promise<void>

  /** Gallery + installed + enabled, merged for the Extensions view */
  getViewModels(): ExtensionViewModel[]

  install(id: string): Promise<void>
  uninstall(id: string): Promise<void>
  setEnabled(id: string, enabled: boolean): Promise<void>
}

export const IExtensionService = createDecorator<IExtensionService>('extensionService')

const DISABLED_KEY = 'extensions.disabled'

/**
 * ExtensionService (renderer) — the "main thread" side of the ext-host RPC AND
 * the extension management surface for the Extensions view.
 *
 * Owns: the RPC connection, the installed extension descriptions, the disabled
 * set (persisted), and the per-extension command registrations (so disabling /
 * uninstalling can deregister cleanly).
 */
export class ExtensionService implements IExtensionService {
  declare readonly _serviceBrand: undefined

  private readonly _onDidChangeExtensions = new Emitter<void>()
  readonly onDidChangeExtensions = this._onDidChangeExtensions.event

  private _extHostExtensions!: ExtHostExtensionServiceShape
  private _extHostCommands!: ExtHostCommandsShape

  private _gallery: GalleryItem[] = []
  private _installed: ExtensionDescription[] = []
  private _disabled = new Set<string>()
  /** Cached merged view models — recomputed on change so getViewModels() is
   *  referentially stable between changes (required by useSyncExternalStore). */
  private _viewModels: ExtensionViewModel[] = []

  /** id → disposables for that extension's registered commands */
  private readonly _commandDisposables = new Map<string, IDisposable[]>()

  constructor(
    @ICommandService private readonly commandService: ICommandService,
    @INotificationService private readonly notificationService: INotificationService,
    @IStorageService private readonly storageService: IStorageService
  ) {}

  async start(): Promise<void> {
    this._disabled = new Set(
      this.storageService.getObject<string[]>(DISABLED_KEY, StorageScope.GLOBAL, [])
    )

    // Load the gallery up front — works without the ext host, so the Extensions
    // view renders immediately (and in browser preview, which has no port).
    this._gallery = await window.electronAPI.extensions.listGallery()
    this._fireChange()

    const port = await extHostPortPromise
    port.start()

    const protocol: IMessagePassingProtocol = {
      send: m => port.postMessage(m),
      onMessage: cb => {
        port.onmessage = (ev): void => cb(ev.data)
      }
    }
    const rpc = new RPCProtocol(protocol)

    this._extHostExtensions = rpc.getProxy<ExtHostExtensionServiceShape>(
      ExtHostContext.ExtHostExtensionService
    )
    this._extHostCommands = rpc.getProxy<ExtHostCommandsShape>(ExtHostContext.ExtHostCommands)

    // MainThread handlers the ext host calls into
    rpc.set<MainThreadCommandsShape>(MainContext.MainThreadCommands, {
      $registerCommand: () => {
        /* handler now lives in the ext host; nothing to do on this side */
      },
      $executeCommand: (id, args) => this.commandService.executeCommand(id, ...args)
    })
    rpc.set<MainThreadMessageShape>(MainContext.MainThreadMessageService, {
      $showMessage: async (severity, message) => {
        this.notificationService.notify(severity as NotificationSeverity, message)
      }
    })

    // Now that the ext host is connected, load installed extensions
    await this._extHostExtensions.$setDisabledExtensions([...this._disabled])
    this._installed = await this._extHostExtensions.$getExtensions()
    this._reconcileCommands()

    console.log(`[renderer] extension host connected, ${this._installed.length} installed`)
    this._fireChange()
  }

  // ── Management ──────────────────────────────────────────────

  getViewModels(): ExtensionViewModel[] {
    return this._viewModels
  }

  private _recomputeViewModels(): void {
    const installedById = new Map(this._installed.map(e => [e.id, e]))
    // Union of gallery ids and installed ids (an installed ext may not be in gallery)
    const ids = new Set<string>([...this._gallery.map(g => g.id), ...installedById.keys()])

    this._viewModels = [...ids].map(id => {
      const g = this._gallery.find(x => x.id === id)
      const inst = installedById.get(id)
      return {
        id,
        displayName: g?.displayName ?? inst?.displayName ?? id,
        description: g?.description ?? '',
        publisher: g?.publisher ?? 'mini-vscode',
        version: g?.version ?? '0.0.0',
        installed: !!inst,
        enabled: !this._disabled.has(id)
      }
    }).sort((a, b) => a.displayName.localeCompare(b.displayName))
  }

  private _fireChange(): void {
    this._recomputeViewModels()
    this._onDidChangeExtensions.fire()
  }

  async install(id: string): Promise<void> {
    await window.electronAPI.extensions.install(id)
    await this._refreshInstalled()
    this.notificationService.notify('info', `Installed extension '${id}'.`)
  }

  async uninstall(id: string): Promise<void> {
    this._disposeCommands(id)
    await window.electronAPI.extensions.uninstall(id)
    await this._refreshInstalled()
    this.notificationService.notify('info', `Uninstalled extension '${id}'.`)
  }

  async setEnabled(id: string, enabled: boolean): Promise<void> {
    if (enabled) this._disabled.delete(id)
    else this._disabled.add(id)
    this.storageService.store(DISABLED_KEY, [...this._disabled], StorageScope.GLOBAL)
    await this._extHostExtensions.$setDisabledExtensions([...this._disabled])
    this._reconcileCommands()
    this._fireChange()
  }

  // ── internals ───────────────────────────────────────────────

  private async _refreshInstalled(): Promise<void> {
    this._installed = await this._extHostExtensions.$rescan()
    this._reconcileCommands()
    this._fireChange()
  }

  /** Register commands for enabled+installed extensions, deregister the rest */
  private _reconcileCommands(): void {
    const shouldHave = new Set(
      this._installed.filter(e => !this._disabled.has(e.id)).map(e => e.id)
    )
    // Deregister extensions that are now disabled/uninstalled
    for (const id of [...this._commandDisposables.keys()]) {
      if (!shouldHave.has(id)) this._disposeCommands(id)
    }
    // Register newly-enabled extensions
    for (const ext of this._installed) {
      if (shouldHave.has(ext.id) && !this._commandDisposables.has(ext.id)) {
        this._registerCommands(ext)
      }
    }
  }

  private _registerCommands(ext: ExtensionDescription): void {
    const disposables: IDisposable[] = []
    for (const cmd of ext.contributes.commands ?? []) {
      disposables.push(
        this.commandService.registerCommand({
          id: cmd.command,
          title: cmd.title,
          category: cmd.category ?? ext.displayName ?? ext.name,
          handler: async (...args: unknown[]) => {
            // Lazy activation, then run the real handler in the ext host
            await this._extHostExtensions.$activateByEvent(`onCommand:${cmd.command}`)
            return this._extHostCommands.$executeContributedCommand(cmd.command, args)
          }
        })
      )
    }
    this._commandDisposables.set(ext.id, disposables)
  }

  private _disposeCommands(id: string): void {
    this._commandDisposables.get(id)?.forEach(d => d.dispose())
    this._commandDisposables.delete(id)
  }
}

registerSingleton(IExtensionService, ExtensionService)
