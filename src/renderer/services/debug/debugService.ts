import { createDecorator } from '../../instantiation/instantiation'
import { registerSingleton } from '../../instantiation/extensions'
import { Emitter, Event } from '../../base/event'
import { IEditorService } from '../editor/editorService'
import { INotificationService } from '../notification/notificationService'

export type DebugStatus = 'inactive' | 'running' | 'stopped'

export interface StackFrame {
  id: number
  name: string
  line: number
  column: number
  source?: { name?: string; path?: string }
}
export interface Scope {
  name: string
  variablesReference: number
}
export interface Variable {
  name: string
  value: string
  variablesReference: number
}

export interface IDebugService {
  readonly _serviceBrand: undefined

  readonly onDidChangeBreakpoints: Event<void>
  /** 会话状态 / 调用栈 / 当前帧变化 */
  readonly onDidChangeState: Event<void>

  readonly status: DebugStatus
  readonly callStack: readonly StackFrame[]
  readonly activeFrameId: number | null
  /** 当前停靠位置（供编辑器高亮当前行） */
  readonly stopLocation: { path: string; line: number } | null

  getBreakpointLines(path: string): number[]
  toggleBreakpoint(path: string, line: number): void

  start(): Promise<void>
  continue(): Promise<void>
  next(): Promise<void>
  stepIn(): Promise<void>
  stepOut(): Promise<void>
  stop(): Promise<void>

  setActiveFrame(frameId: number): Promise<void>
  getScopes(frameId: number): Promise<Scope[]>
  getVariables(reference: number): Promise<Variable[]>
}

export const IDebugService = createDecorator<IDebugService>('debugService')

/**
 * DebugService（renderer）—— Phase 14 调试的「主线程」侧 + UI view model。
 * 持断点模型 + 会话状态；DAP 客户端在主进程（DebugService main），这里经
 * window.electronAPI.debug 调请求、订阅事件。`stopped` 时拉 stackTrace，
 * 选中栈顶帧 → 暴露 stopLocation 给编辑器高亮，调用栈/变量给 Debug 视图。
 */
export class DebugService implements IDebugService {
  declare readonly _serviceBrand: undefined

  private readonly _onDidChangeBreakpoints = new Emitter<void>()
  readonly onDidChangeBreakpoints = this._onDidChangeBreakpoints.event
  private readonly _onDidChangeState = new Emitter<void>()
  readonly onDidChangeState = this._onDidChangeState.event

  private readonly _breakpoints = new Map<string, Set<number>>()
  private _status: DebugStatus = 'inactive'
  private _callStack: StackFrame[] = []
  private _activeFrameId: number | null = null
  private _stopLocation: { path: string; line: number } | null = null
  private _threadId = 1
  private _subscribed = false

  constructor(
    @IEditorService private readonly editorService: IEditorService,
    @INotificationService private readonly notificationService: INotificationService
  ) {}

  get status(): DebugStatus {
    return this._status
  }
  get callStack(): readonly StackFrame[] {
    return this._callStack
  }
  get activeFrameId(): number | null {
    return this._activeFrameId
  }
  get stopLocation(): { path: string; line: number } | null {
    return this._stopLocation
  }

  // ── 断点 ──────────────────────────────────────────────
  getBreakpointLines(path: string): number[] {
    return [...(this._breakpoints.get(path) ?? [])].sort((a, b) => a - b)
  }
  toggleBreakpoint(path: string, line: number): void {
    let set = this._breakpoints.get(path)
    if (!set) {
      set = new Set()
      this._breakpoints.set(path, set)
    }
    if (set.has(line)) set.delete(line)
    else set.add(line)
    this._onDidChangeBreakpoints.fire()
    // 会话进行中则同步给 adapter
    if (this._status !== 'inactive') {
      void window.electronAPI.debug.setBreakpoints(path, [...set])
    }
  }

  // ── 会话控制 ──────────────────────────────────────────
  async start(): Promise<void> {
    this._ensureSubscribed()
    const program = this.editorService.activePath
    if (!program) {
      this.notificationService.notify('warning', '先打开一个文件作为调试目标（程序入口）。')
      return
    }
    const breakpoints = [...this._breakpoints].map(([path, set]) => ({ path, lines: [...set] }))
    this._status = 'running'
    this._stopLocation = null
    this._onDidChangeState.fire()
    await window.electronAPI.debug.start(
      { type: 'mock', request: 'launch', program, name: 'Mock Debug' },
      breakpoints
    )
  }
  continue(): Promise<void> {
    return this._control('continue')
  }
  next(): Promise<void> {
    return this._control('next')
  }
  stepIn(): Promise<void> {
    return this._control('stepIn')
  }
  stepOut(): Promise<void> {
    return this._control('stepOut')
  }
  async stop(): Promise<void> {
    await window.electronAPI.debug.stop()
    this._setInactive()
  }

  private async _control(command: string): Promise<void> {
    if (this._status !== 'stopped') return
    this._status = 'running'
    this._stopLocation = null
    this._onDidChangeState.fire()
    await window.electronAPI.debug.request(command, { threadId: this._threadId })
  }

  // ── 变量树（懒展开）────────────────────────────────────
  async setActiveFrame(frameId: number): Promise<void> {
    this._activeFrameId = frameId
    const frame = this._callStack.find(f => f.id === frameId)
    if (frame?.source?.path) this._stopLocation = { path: frame.source.path, line: frame.line }
    this._onDidChangeState.fire()
  }
  async getScopes(frameId: number): Promise<Scope[]> {
    const body = (await window.electronAPI.debug.request('scopes', { frameId })) as { scopes?: Scope[] }
    return body?.scopes ?? []
  }
  async getVariables(reference: number): Promise<Variable[]> {
    const body = (await window.electronAPI.debug.request('variables', {
      variablesReference: reference
    })) as { variables?: Variable[] }
    return body?.variables ?? []
  }

  // ── 事件 ──────────────────────────────────────────────
  private _ensureSubscribed(): void {
    if (this._subscribed) return
    this._subscribed = true
    window.electronAPI.debug.onEvent(e => this._onEvent(e.event, e.body))
  }

  private async _onEvent(event: string, body: unknown): Promise<void> {
    if (event === 'stopped') {
      const b = body as { threadId?: number }
      this._threadId = b.threadId ?? 1
      this._status = 'stopped'
      const st = (await window.electronAPI.debug.request('stackTrace', {
        threadId: this._threadId
      })) as { stackFrames?: StackFrame[] }
      this._callStack = st?.stackFrames ?? []
      const top = this._callStack[0]
      this._activeFrameId = top?.id ?? null
      this._stopLocation = top?.source?.path ? { path: top.source.path, line: top.line } : null
      this._onDidChangeState.fire()
    } else if (event === 'continued') {
      this._status = 'running'
      this._stopLocation = null
      this._onDidChangeState.fire()
    } else if (event === 'terminated' || event === 'exited') {
      this._setInactive()
    }
  }

  private _setInactive(): void {
    this._status = 'inactive'
    this._callStack = []
    this._activeFrameId = null
    this._stopLocation = null
    this._onDidChangeState.fire()
  }
}

registerSingleton(IDebugService, DebugService)
