import { createDecorator } from '../../instantiation/instantiation'
import { registerSingleton } from '../../instantiation/extensions'
import { Emitter, Event } from '../../base/event'
import { IEditorService } from '../editor/editorService'
import { INotificationService } from '../notification/notificationService'
import { IWorkspaceService } from '../workspace/workspaceService'

export type DebugStatus = 'inactive' | 'running' | 'stopped'

export interface DebugLaunchConfig {
  name?: string
  type?: string
  request?: 'launch' | 'attach'
  program?: string
  cwd?: string
  debugServer?: number
  adapterHost?: string
  adapterCommand?: string
  adapterArgs?: string[]
  adapterEnv?: Record<string, string>
  adapterCwd?: string
  [key: string]: unknown
}
export interface DebugBreakpoint {
  line: number
  verified?: boolean
  message?: string
}
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
export interface DebugConsoleEntry {
  id: number
  kind: 'input' | 'result' | 'output' | 'error'
  text: string
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
  readonly consoleEntries: readonly DebugConsoleEntry[]

  getBreakpointLines(path: string): number[]
  getBreakpoints(path: string): DebugBreakpoint[]
  toggleBreakpoint(path: string, line: number): void

  start(config?: DebugLaunchConfig): Promise<void>
  continue(): Promise<void>
  next(): Promise<void>
  stepIn(): Promise<void>
  stepOut(): Promise<void>
  stop(): Promise<void>

  setActiveFrame(frameId: number): Promise<void>
  getScopes(frameId: number): Promise<Scope[]>
  getVariables(reference: number): Promise<Variable[]>
  evaluate(expression: string, context?: 'repl' | 'watch'): Promise<Variable>
  clearConsole(): void
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
  private readonly _breakpointDetails = new Map<string, Map<number, DebugBreakpoint>>()
  private _status: DebugStatus = 'inactive'
  private _callStack: StackFrame[] = []
  private _activeFrameId: number | null = null
  private _stopLocation: { path: string; line: number } | null = null
  private _consoleEntries: DebugConsoleEntry[] = []
  private _threadId = 1
  private _subscribed = false
  private _consoleSeq = 0

  constructor(
    @IEditorService private readonly editorService: IEditorService,
    @INotificationService private readonly notificationService: INotificationService,
    @IWorkspaceService private readonly workspaceService: IWorkspaceService
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
  get consoleEntries(): readonly DebugConsoleEntry[] {
    return this._consoleEntries
  }

  // ── 断点 ──────────────────────────────────────────────
  getBreakpointLines(path: string): number[] {
    return [...(this._breakpoints.get(path) ?? [])].sort((a, b) => a - b)
  }
  getBreakpoints(path: string): DebugBreakpoint[] {
    const details = this._breakpointDetails.get(path)
    return this.getBreakpointLines(path).map(line => ({
      line,
      verified: details?.get(line)?.verified,
      message: details?.get(line)?.message
    }))
  }
  toggleBreakpoint(path: string, line: number): void {
    let set = this._breakpoints.get(path)
    if (!set) {
      set = new Set()
      this._breakpoints.set(path, set)
    }
    if (set.has(line)) set.delete(line)
    else set.add(line)
    this._syncBreakpointDetails(path, set)
    this._onDidChangeBreakpoints.fire()
    // 会话进行中则同步给 adapter
    if (this._status !== 'inactive') {
      void this._sendBreakpoints(path, [...set])
    }
  }

  // ── 会话控制 ──────────────────────────────────────────
  async start(config?: DebugLaunchConfig): Promise<void> {
    this._ensureSubscribed()
    const launchConfig = config ? this._resolveVariables(config) : await this._loadLaunchConfig()
    if (!launchConfig) return

    if (launchConfig.request !== 'attach' && !launchConfig.program) {
      this.notificationService.notify('warning', '先打开一个文件作为调试目标（程序入口）。')
      return
    }

    const breakpoints = [...this._breakpoints].map(([path, set]) => ({ path, lines: [...set] }))
    this._status = 'running'
    this._stopLocation = null
    this._onDidChangeState.fire()

    try {
      const result = await window.electronAPI.debug.start(launchConfig, breakpoints)
      this._applyStartResult(result)
    } catch (err) {
      this._addConsoleEntry('error', errorMessage(err))
      this.notificationService.notify('error', errorMessage(err))
      this._setInactive()
    }
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
  async evaluate(expression: string, context: 'repl' | 'watch' = 'repl'): Promise<Variable> {
    const trimmed = expression.trim()
    if (!trimmed) return { name: '', value: '', variablesReference: 0 }
    if (context === 'repl') this._addConsoleEntry('input', `> ${trimmed}`)
    try {
      const body = (await window.electronAPI.debug.request('evaluate', {
        expression: trimmed,
        frameId: this._activeFrameId ?? undefined,
        context
      })) as { result?: string; variablesReference?: number }
      const variable = {
        name: trimmed,
        value: body?.result ?? '',
        variablesReference: body?.variablesReference ?? 0
      }
      if (context === 'repl') this._addConsoleEntry('result', variable.value)
      return variable
    } catch (err) {
      const message = errorMessage(err)
      if (context === 'repl') this._addConsoleEntry('error', message)
      throw err
    }
  }

  clearConsole(): void {
    this._consoleEntries = []
    this._onDidChangeState.fire()
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
    } else if (event === 'output') {
      const b = body as { output?: string; category?: string }
      this._addConsoleEntry(b.category === 'stderr' ? 'error' : 'output', b.output ?? '')
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

  private async _sendBreakpoints(path: string, lines: number[]): Promise<void> {
    try {
      const body = await window.electronAPI.debug.setBreakpoints(path, lines)
      this._applyBreakpointResponse(path, body, lines)
    } catch (err) {
      this._addConsoleEntry('error', errorMessage(err))
      this.notificationService.notify('error', errorMessage(err))
    }
  }

  private _applyStartResult(result: unknown): void {
    const r = result as { breakpointSets?: { path: string; breakpoints: DebugBreakpoint[] }[] } | undefined
    for (const set of r?.breakpointSets ?? []) {
      this._applyBreakpointResponse(set.path, { breakpoints: set.breakpoints }, this.getBreakpointLines(set.path))
    }
  }

  private _applyBreakpointResponse(path: string, body: unknown, requestedLines: number[]): void {
    const response = body as { breakpoints?: DebugBreakpoint[] } | undefined
    const details = new Map<number, DebugBreakpoint>()
    const returned = response?.breakpoints ?? requestedLines.map(line => ({ line, verified: true }))
    returned.forEach((bp, i) => {
      const line = typeof bp.line === 'number' ? bp.line : requestedLines[i]
      if (typeof line !== 'number') return
      details.set(line, { line, verified: bp.verified, message: bp.message })
    })
    this._breakpointDetails.set(path, details)
    this._onDidChangeBreakpoints.fire()
  }

  private _syncBreakpointDetails(path: string, lines: Set<number>): void {
    const details = this._breakpointDetails.get(path)
    if (!details) return
    for (const line of [...details.keys()]) {
      if (!lines.has(line)) details.delete(line)
    }
    for (const line of lines) {
      if (!details.has(line)) details.set(line, { line })
    }
  }

  private async _loadLaunchConfig(): Promise<DebugLaunchConfig | null> {
    const root = this.workspaceService.root
    if (root) {
      const config = await this._readFirstLaunchConfig(root)
      if (config) return this._resolveVariables(config)
    }

    const program = this.editorService.activePath
    if (!program) {
      this.notificationService.notify('warning', '先打开一个文件作为调试目标（程序入口）。')
      return null
    }
    return { type: 'mock', request: 'launch', program, name: 'Mock Debug' }
  }

  private async _readFirstLaunchConfig(root: string): Promise<DebugLaunchConfig | null> {
    const launchPath = `${root.replace(/\/$/, '')}/.vscode/launch.json`
    try {
      const raw = await window.electronAPI.fs.readFile(launchPath)
      const parsed = JSON.parse(stripJsonComments(raw)) as { configurations?: DebugLaunchConfig[] }
      const configs = Array.isArray(parsed.configurations) ? parsed.configurations : []
      if (configs.length > 0) return configs[0]
      this.notificationService.notify('warning', '.vscode/launch.json 中没有 configurations。')
      return null
    } catch (err) {
      // Missing launch.json is fine; invalid JSON should be visible.
      if (String(err).includes('ENOENT')) return null
      this.notificationService.notify('error', `读取 launch.json 失败：${errorMessage(err)}`)
      return null
    }
  }

  private _resolveVariables(config: DebugLaunchConfig): DebugLaunchConfig {
    const root = this.workspaceService.root ?? ''
    const file = this.editorService.activePath ?? ''
    return replaceConfigVars(config, {
      workspaceFolder: root,
      file
    }) as DebugLaunchConfig
  }

  private _addConsoleEntry(kind: DebugConsoleEntry['kind'], text: string): void {
    if (!text) return
    this._consoleEntries = [...this._consoleEntries, { id: ++this._consoleSeq, kind, text }]
    this._onDidChangeState.fire()
  }
}

registerSingleton(IDebugService, DebugService)

function stripJsonComments(input: string): string {
  return input
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

function replaceConfigVars(value: unknown, vars: Record<string, string>): unknown {
  if (typeof value === 'string') {
    return value.replace(/\$\{(workspaceFolder|file)\}/g, (_, key: string) => vars[key] ?? '')
  }
  if (Array.isArray(value)) return value.map(v => replaceConfigVars(v, vars))
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, replaceConfigVars(v, vars)])
    )
  }
  return value
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
