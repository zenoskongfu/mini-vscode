import { createDecorator } from '../../instantiation/instantiation'
import { registerSingleton } from '../../instantiation/extensions'
import { Emitter, Event } from '../../base/event'

/** 一个已打开的编辑器标签页 */
export interface EditorTab {
  path: string
  name: string
  /** 从磁盘加载到的内容（“已保存”的基线） */
  savedContent: string
  /** 编辑器里的当前实时内容（切换标签页时保留未保存修改） */
  content: string
  /** 当 content 与 savedContent 不同时为 true */
  dirty: boolean
}

export interface IEditorService {
  readonly _serviceBrand: undefined

  /** 标签页列表变化（打开/关闭）或 dirty 状态翻转时触发 */
  readonly onDidChangeTabs: Event<void>
  /** 当前活动编辑器变化时触发 */
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
 * EditorService 持有已打开标签页列表与当前活动编辑器，
 * 对应 VSCode 的 IEditorService。
 * 状态位于 class 内部；视图通过 onDidChangeTabs / onDidChangeActiveEditor 订阅。
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
