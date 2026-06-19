import { createDecorator } from '../../instantiation/instantiation'
import { registerSingleton } from '../../instantiation/extensions'
import { Emitter, Event } from '../../base/event'
import { IStorageService, StorageScope } from '../storage/storageService'
import type { FileNode } from '../../types/file-tree'

export interface IWorkspaceService {
  readonly _serviceBrand: undefined

  /** Fires whenever the open folder changes (open/close) */
  readonly onDidChangeRoot: Event<string | null>

  readonly root: string | null

  openFolder(): Promise<void>
  setRoot(path: string | null): Promise<void>
  closeFolder(): Promise<void>
  readDir(path: string): Promise<FileNode[]>
  restore(): void
}

export const IWorkspaceService = createDecorator<IWorkspaceService>('workspaceService')

const STORAGE_KEY_ROOT = 'workspace.root'

/**
 * WorkspaceService — owns the active folder root.
 * State lives in the class; consumers subscribe to onDidChangeRoot.
 * The last opened folder is persisted via IStorageService (GLOBAL scope).
 */
export class WorkspaceService implements IWorkspaceService {
  declare readonly _serviceBrand: undefined

  private _root: string | null = null

  private readonly _onDidChangeRoot = new Emitter<string | null>()
  readonly onDidChangeRoot = this._onDidChangeRoot.event

  constructor(@IStorageService private readonly storageService: IStorageService) {}

  get root(): string | null {
    return this._root
  }

  /** Restore the previously opened folder (called once at startup) */
  restore(): void {
    const saved = this.storageService.get(STORAGE_KEY_ROOT, StorageScope.GLOBAL)
    if (saved) {
      this.setRoot(saved)
    }
  }

  async openFolder(): Promise<void> {
    const folderPath = await window.electronAPI.dialog.openFolder()
    if (!folderPath) return
    await this.setRoot(folderPath)
  }

  async setRoot(path: string | null): Promise<void> {
    if (this._root === path) return

    // Stop watching the previous root
    if (this._root) {
      await window.electronAPI.fs.watchStop(this._root)
    }

    this._root = path

    if (path) {
      this.storageService.store(STORAGE_KEY_ROOT, path, StorageScope.GLOBAL)
      await window.electronAPI.fs.watchStart(path)
    } else {
      this.storageService.remove(STORAGE_KEY_ROOT, StorageScope.GLOBAL)
    }

    this._onDidChangeRoot.fire(path)
  }

  async closeFolder(): Promise<void> {
    await this.setRoot(null)
  }

  async readDir(path: string): Promise<FileNode[]> {
    return (await window.electronAPI.fs.readDir(path)) as FileNode[]
  }
}

registerSingleton(IWorkspaceService, WorkspaceService)
