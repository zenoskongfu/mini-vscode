import { createDecorator } from '../../instantiation/instantiation'
import { registerSingleton } from '../../instantiation/extensions'
import { Emitter, Event } from '../../base/event'

/** A single open editor tab */
export interface EditorTab {
  path: string
  name: string
  /** Content as loaded from disk (the "saved" baseline) */
  savedContent: string
  /** Live content currently in the editor (preserves unsaved edits across tabs) */
  content: string
  /** true when content differs from savedContent */
  dirty: boolean
}

export interface IEditorService {
  readonly _serviceBrand: undefined

  /** Fires when the tab list changes (open/close) or a tab's dirty state flips */
  readonly onDidChangeTabs: Event<void>
  /** Fires when the active editor changes */
  readonly onDidChangeActiveEditor: Event<string | null>

  readonly tabs: readonly EditorTab[]
  readonly activePath: string | null
  readonly activeTab: EditorTab | null

  openEditor(path: string): Promise<void>
  activate(path: string): void
  close(path: string): void
  updateContent(path: string, content: string): void
  save(path: string): Promise<void>
}

export const IEditorService = createDecorator<IEditorService>('editorService')

/**
 * EditorService — owns the open-tab list and active editor (VSCode IEditorService analog).
 * State lives in the class; views subscribe via onDidChangeTabs / onDidChangeActiveEditor.
 */
export class EditorService implements IEditorService {
  declare readonly _serviceBrand: undefined

  private _tabs: EditorTab[] = []
  private _activePath: string | null = null

  private readonly _onDidChangeTabs = new Emitter<void>()
  readonly onDidChangeTabs = this._onDidChangeTabs.event

  private readonly _onDidChangeActiveEditor = new Emitter<string | null>()
  readonly onDidChangeActiveEditor = this._onDidChangeActiveEditor.event

  get tabs(): readonly EditorTab[] {
    return this._tabs
  }

  get activePath(): string | null {
    return this._activePath
  }

  get activeTab(): EditorTab | null {
    return this._tabs.find(t => t.path === this._activePath) ?? null
  }

  private _setActive(path: string | null): void {
    if (this._activePath === path) return
    this._activePath = path
    this._onDidChangeActiveEditor.fire(path)
  }

  async openEditor(path: string): Promise<void> {
    const existing = this._tabs.find(t => t.path === path)
    if (existing) {
      this._setActive(path)
      return
    }

    let content = ''
    try {
      content = await window.electronAPI.fs.readFile(path)
    } catch {
      content = ''
    }

    const tab: EditorTab = {
      path,
      name: path.split('/').pop() ?? path,
      savedContent: content,
      content,
      dirty: false
    }
    this._tabs = [...this._tabs, tab]
    this._onDidChangeTabs.fire()
    this._setActive(path)
  }

  activate(path: string): void {
    this._setActive(path)
  }

  close(path: string): void {
    const idx = this._tabs.findIndex(t => t.path === path)
    if (idx === -1) return

    this._tabs = this._tabs.filter(t => t.path !== path)
    this._onDidChangeTabs.fire()

    if (this._activePath === path) {
      const neighbour = this._tabs[idx] ?? this._tabs[idx - 1] ?? null
      this._setActive(neighbour ? neighbour.path : null)
    }
  }

  updateContent(path: string, currentContent: string): void {
    const tab = this._tabs.find(t => t.path === path)
    if (!tab || tab.content === currentContent) return
    const wasDirty = tab.dirty
    tab.content = currentContent
    tab.dirty = currentContent !== tab.savedContent
    if (tab.dirty !== wasDirty) {
      this._onDidChangeTabs.fire()
    }
  }

  async save(path: string): Promise<void> {
    const tab = this._tabs.find(t => t.path === path)
    if (!tab) return
    await window.electronAPI.fs.writeFile(path, tab.content)
    tab.savedContent = tab.content
    tab.dirty = false
    this._onDidChangeTabs.fire()
  }
}

registerSingleton(IEditorService, EditorService)
