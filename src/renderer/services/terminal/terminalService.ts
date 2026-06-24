import { createDecorator } from '../../instantiation/instantiation'
import { registerSingleton } from '../../instantiation/extensions'
import { Emitter, Event } from '../../base/event'
import { IWorkspaceService } from '../workspace/workspaceService'

export interface ITerminalInstance {
  id: string
  title: string
}

export interface ITerminalService {
  readonly _serviceBrand: undefined

  /** 终端新增/移除或当前活动终端变化时触发 */
  readonly onDidChangeTerminals: Event<void>

  readonly terminals: readonly ITerminalInstance[]
  readonly activeId: string | null

  createTerminal(cwd?: string): ITerminalInstance
  setActive(id: string): void
  closeTerminal(id: string): void

  write(id: string, data: string): void
  resize(id: string, cols: number, rows: number): void

  /** 订阅指定终端的输出流；返回取消订阅函数 */
  onTerminalData(id: string, cb: (data: string) => void): () => void
}

export const ITerminalService = createDecorator<ITerminalService>('terminalService')

let seq = 0

/**
 * TerminalService（renderer）管理终端实例元数据，并把 xterm 视图
 * 通过 IPC 桥接到 main 进程里的 pty。
 *
 * 它只持有一组 `terminal:data` / `terminal:exit` 订阅，
 * 再把输出分发到按 id 记录的回调（xterm 视图会在这里注册 writer）。
 */
export class TerminalService implements ITerminalService {
  declare readonly _serviceBrand: undefined

  private _terminals: ITerminalInstance[] = []
  private _activeId: string | null = null

  /** id → 输出接收器（已挂载 xterm 的 write 方法） */
  private _dataSinks = new Map<string, (data: string) => void>()

  private readonly _onDidChangeTerminals = new Emitter<void>()
  readonly onDidChangeTerminals = this._onDidChangeTerminals.event

  constructor(@IWorkspaceService private readonly workspaceService: IWorkspaceService) {
    // 只建立一次 IPC 订阅，再按 id 分发
    window.electronAPI.terminal.onData((id, data) => {
      this._dataSinks.get(id)?.(data)
    })
    window.electronAPI.terminal.onExit(id => {
      this.closeTerminal(id)
    })
  }

  get terminals(): readonly ITerminalInstance[] {
    return this._terminals
  }

  get activeId(): string | null {
    return this._activeId
  }

  /**
   * 创建终端。
   * @param cwd 显式覆盖目录。省略时使用默认 cwd 策略：
   *   显式 cwd ?? 工作区根目录 ??（main 进程回退到 home 目录）。
   *   将策略集中在这里，调用点就不会忘记处理 cwd。
   */
  createTerminal(cwd?: string): ITerminalInstance {
    const n = ++seq
    const id = `term-${n}`
    // 标题带稳定序号，关闭某个终端后其他终端标签不会重新编号
    const instance: ITerminalInstance = { id, title: `bash ${n}` }
    this._terminals = [...this._terminals, instance]
    this._activeId = id
    const dir = cwd ?? this.workspaceService.root ?? ''
    window.electronAPI.terminal.create(id, dir)
    this._onDidChangeTerminals.fire()
    return instance
  }

  setActive(id: string): void {
    if (this._activeId === id) return
    this._activeId = id
    this._onDidChangeTerminals.fire()
  }

  closeTerminal(id: string): void {
    if (!this._terminals.some(t => t.id === id)) return
    const idx = this._terminals.findIndex(t => t.id === id)
    this._terminals = this._terminals.filter(t => t.id !== id)
    this._dataSinks.delete(id)
    window.electronAPI.terminal.kill(id)

    if (this._activeId === id) {
      const neighbour = this._terminals[idx] ?? this._terminals[idx - 1] ?? null
      this._activeId = neighbour ? neighbour.id : null
    }
    this._onDidChangeTerminals.fire()
  }

  write(id: string, data: string): void {
    window.electronAPI.terminal.input(id, data)
  }

  resize(id: string, cols: number, rows: number): void {
    window.electronAPI.terminal.resize(id, cols, rows)
  }

  onTerminalData(id: string, cb: (data: string) => void): () => void {
    this._dataSinks.set(id, cb)
    return () => {
      if (this._dataSinks.get(id) === cb) this._dataSinks.delete(id)
    }
  }
}

registerSingleton(ITerminalService, TerminalService)
