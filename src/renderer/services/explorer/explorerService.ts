import { createDecorator } from '../../instantiation/instantiation'
import { registerSingleton } from '../../instantiation/extensions'
import { Emitter, Event } from '../../base/event'

/**
 * ExplorerService（renderer）—— Phase 15 #1/#2/#4。
 *
 * 把文件树的「展开态 / 选中项」从组件本地 state 提到服务里，于是：
 *  - 切换 sidebar 视图后 FileExplorer 卸载，展开态仍在（#1）；
 *  - 顶部 New File/Folder 知道在哪个目录新建（基于选中项，#2）；
 *  - 新建/重命名/删除后能定向刷新对应目录的子节点（onDidRequestRefresh，#4）。
 * 对应 VSCode 的 explorer view model（核心在服务，视图只投影）。
 */
export interface IExplorerService {
  readonly _serviceBrand: undefined
  /** 展开态 / 选中项变化 */
  readonly onDidChange: Event<void>
  /** 某目录的子节点需要重新加载 */
  readonly onDidRequestRefresh: Event<string>

  isExpanded(path: string): boolean
  setExpanded(path: string, expanded: boolean): void
  toggleExpanded(path: string): void

  readonly selectedPath: string | null
  setSelected(path: string, isDirectory: boolean): void
  /** 在哪个目录里新建：选中目录→它本身；选中文件→其父目录；无选中→ rootFallback */
  getCreateTargetDir(rootFallback: string): string

  refresh(dirPath: string): void
}

export const IExplorerService = createDecorator<IExplorerService>('explorerService')

export class ExplorerService implements IExplorerService {
  declare readonly _serviceBrand: undefined

  private readonly _expanded = new Set<string>()
  private _selected: { path: string; isDirectory: boolean } | null = null

  private readonly _onDidChange = new Emitter<void>()
  readonly onDidChange = this._onDidChange.event
  private readonly _onDidRequestRefresh = new Emitter<string>()
  readonly onDidRequestRefresh = this._onDidRequestRefresh.event

  isExpanded(path: string): boolean {
    return this._expanded.has(path)
  }
  setExpanded(path: string, expanded: boolean): void {
    if (expanded === this._expanded.has(path)) return
    if (expanded) this._expanded.add(path)
    else this._expanded.delete(path)
    this._onDidChange.fire()
  }
  toggleExpanded(path: string): void {
    this.setExpanded(path, !this._expanded.has(path))
  }

  get selectedPath(): string | null {
    return this._selected?.path ?? null
  }
  setSelected(path: string, isDirectory: boolean): void {
    if (this._selected?.path === path) return
    this._selected = { path, isDirectory }
    this._onDidChange.fire()
  }
  getCreateTargetDir(rootFallback: string): string {
    if (!this._selected) return rootFallback
    return this._selected.isDirectory
      ? this._selected.path
      : this._selected.path.substring(0, this._selected.path.lastIndexOf('/'))
  }

  refresh(dirPath: string): void {
    this._onDidRequestRefresh.fire(dirPath)
  }
}

registerSingleton(IExplorerService, ExplorerService)
