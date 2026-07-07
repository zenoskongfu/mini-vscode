import { createDecorator } from '../../instantiation/instantiation'
import { registerSingleton } from '../../instantiation/extensions'
import { Emitter, Event } from '../../base/event'

export type QuickInputMode = 'commands' | 'pick'

export interface QuickPickItem<T = unknown> {
  id?: string
  label: string
  description?: string
  detail?: string
  value: T
}

export interface QuickPickOptions {
  title?: string
  placeholder?: string
}

export interface IQuickInputService {
  readonly _serviceBrand: undefined

  readonly onDidChange: Event<void>
  readonly onDidChangeVisibility: Event<boolean>
  readonly isVisible: boolean
  readonly mode: QuickInputMode
  readonly stateVersion: number
  readonly pickItems: readonly QuickPickItem[]
  readonly pickOptions: QuickPickOptions | undefined

  show(): void
  hide(): void
  toggle(): void
  pick<T>(items: readonly QuickPickItem<T>[], options?: QuickPickOptions): Promise<QuickPickItem<T> | undefined>
  acceptPick(item: QuickPickItem): void
}

export const IQuickInputService = createDecorator<IQuickInputService>('quickInputService')

/**
 * QuickInputService 持有命令面板覆盖层的可见性，
 * 对应 VSCode 的 IQuickInputService（此处先支持命令面板和简单 pick 列表）。
 */
export class QuickInputService implements IQuickInputService {
  declare readonly _serviceBrand: undefined

  private _visible = false
  private _mode: QuickInputMode = 'commands'
  private _stateVersion = 0
  private _pickItems: readonly QuickPickItem[] = []
  private _pickOptions: QuickPickOptions | undefined
  private _pendingPick: ((item: QuickPickItem | undefined) => void) | undefined

  private readonly _onDidChange = new Emitter<void>()
  readonly onDidChange = this._onDidChange.event
  private readonly _onDidChangeVisibility = new Emitter<boolean>()
  readonly onDidChangeVisibility = this._onDidChangeVisibility.event

  get isVisible(): boolean {
    return this._visible
  }

  get mode(): QuickInputMode {
    return this._mode
  }

  get stateVersion(): number {
    return this._stateVersion
  }

  get pickItems(): readonly QuickPickItem[] {
    return this._pickItems
  }

  get pickOptions(): QuickPickOptions | undefined {
    return this._pickOptions
  }

  show(): void {
    this.cancelPendingPick()
    this._mode = 'commands'
    this._pickItems = []
    this._pickOptions = undefined
    this.setVisible(true)
  }

  hide(): void {
    if (this._pendingPick) {
      this.resolvePick(undefined)
      return
    }
    this._mode = 'commands'
    this._pickItems = []
    this._pickOptions = undefined
    this.setVisible(false)
  }

  toggle(): void {
    this._visible ? this.hide() : this.show()
  }

  pick<T>(items: readonly QuickPickItem<T>[], options?: QuickPickOptions): Promise<QuickPickItem<T> | undefined> {
    this.cancelPendingPick()
    return new Promise(resolve => {
      this._pendingPick = item => resolve(item as QuickPickItem<T> | undefined)
      this._mode = 'pick'
      this._pickItems = items as readonly QuickPickItem[]
      this._pickOptions = options
      this.setVisible(true)
    })
  }

  acceptPick(item: QuickPickItem): void {
    if (this._mode !== 'pick') return
    this.resolvePick(item)
  }

  private cancelPendingPick(): void {
    if (!this._pendingPick) return
    this.resolvePick(undefined)
  }

  private resolvePick(item: QuickPickItem | undefined): void {
    const resolve = this._pendingPick
    this._pendingPick = undefined
    this._pickItems = []
    this._pickOptions = undefined
    this._mode = 'commands'
    this.setVisible(false)
    resolve?.(item)
  }

  private setVisible(visible: boolean): void {
    if (this._visible !== visible) {
      this._visible = visible
      this._onDidChangeVisibility.fire(visible)
    }
    this.fireChange()
  }

  private fireChange(): void {
    this._stateVersion += 1
    this._onDidChange.fire()
  }
}

registerSingleton(IQuickInputService, QuickInputService)
