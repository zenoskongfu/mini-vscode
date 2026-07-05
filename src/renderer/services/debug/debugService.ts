import { createDecorator } from '../../instantiation/instantiation'
import { registerSingleton } from '../../instantiation/extensions'
import { Emitter, Event } from '../../base/event'
import { IEditorService } from '../editor/editorService'
import { INotificationService } from '../notification/notificationService'
import { IWorkspaceService } from '../workspace/workspaceService'

export type DebugStatus = 'inactive' | 'running' | 'stopped'

export interface DebugLaunchConfig {
  /**
   * renderer 侧只关心 launch.json 的常用字段。
   * 其它 js-debug 支持的字段通过 [key: string] 透传给 main/adapter。
   */
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
  /** UI 里的一个断点。verified/message 来自 adapter 的 setBreakpoints response/event。 */
  line: number
  verified?: boolean
  message?: string
}
export interface StackFrame {
  /** DAP stackFrame.id，后续 scopes/evaluate 都要带这个 id。 */
  id: number
  name: string
  line: number
  column: number
  source?: { name?: string; path?: string }
}
export interface Scope {
  /** DAP scope，例如 Local / Global / Closure。 */
  name: string
  /** 变量树懒加载的句柄；等用户展开时再用 variables 请求取子变量。 */
  variablesReference: number
}
export interface Variable {
  /** DAP variable，variablesReference > 0 表示还可以继续展开。 */
  name: string
  value: string
  variablesReference: number
}
export interface DebugConsoleEntry {
  /** Debug Console 里的展示行，既包括 adapter output，也包括用户 evaluate 输入/结果。 */
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
  readonly activeSessionLabel: string | null
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
 *
 * 注意：renderer 不能直接 import fs/net/child_process，也不应该直接启动 adapter。
 * 它只像 VS Code 的 workbench 一样维护 UI 模型，把真正危险的事情交给 main。
 */
export class DebugService implements IDebugService {
  declare readonly _serviceBrand: undefined

  private readonly _onDidChangeBreakpoints = new Emitter<void>()
  readonly onDidChangeBreakpoints = this._onDidChangeBreakpoints.event
  private readonly _onDidChangeState = new Emitter<void>()
  readonly onDidChangeState = this._onDidChangeState.event

  /** path -> line set。断点先存在 renderer，这样 UI 不启动调试也能显示红点。 */
  private readonly _breakpoints = new Map<string, Set<number>>()
  /** path -> line -> adapter 验证详情。和 _breakpoints 分开，方便保留 UI 断点集合。 */
  private readonly _breakpointDetails = new Map<string, Map<number, DebugBreakpoint>>()
  private _status: DebugStatus = 'inactive'
  private _callStack: StackFrame[] = []
  private _activeFrameId: number | null = null
  private _stopLocation: { path: string; line: number } | null = null
  private _activeSessionLabel: string | null = null
  private _consoleEntries: DebugConsoleEntry[] = []
  /** 当前控制命令使用的 threadId。完整 VS Code 会维护多线程模型，这里先取 stopped 事件里的线程。 */
  private _threadId = 1
  /** 避免重复订阅 main 推来的 debug:event。 */
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
  get activeSessionLabel(): string | null {
    return this._activeSessionLabel
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
    // Monaco gutter 点击只改变 renderer 的断点模型。
    // 如果当前正在调试，再异步把这个文件的新断点集合同步给 adapter。
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
    // 第一次启动调试时才订阅 main 进程事件，避免服务实例化后就占用 IPC listener。
    this._ensureSubscribed()
    // 有显式 config 就用显式 config；否则读取 .vscode/launch.json；
    // 如果没有 launch.json，JS/TS 文件默认走真实 node/js-debug。
    const launchConfig = config ? this._resolveVariables(config) : await this._loadLaunchConfig()
    if (!launchConfig) return

    if (launchConfig.request !== 'attach' && !launchConfig.program) {
      this.notificationService.notify('warning', '先打开一个文件作为调试目标（程序入口）。')
      return
    }

    const breakpoints = [...this._breakpoints].map(([path, set]) => ({ path, lines: [...set] }))
    const sessionLabel = sessionLabelFor(launchConfig)
    this._activeSessionLabel = sessionLabel
    this._status = 'running'
    this._stopLocation = null
    // 在 Debug Console 里明确告诉用户当前跑的是 node 还是 mock，避免把 mock 当真实调试。
    this._addConsoleEntry('output', `Starting ${sessionLabel}`)
    this._onDidChangeState.fire()

    try {
      // debug.start 是一次 IPC invoke：renderer -> preload -> main -> adapter。
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
    // continue/next/stepIn/stepOut 都要求程序当前处于 stopped。
    // 发出控制命令后，UI 先切 running，等 adapter 再发 stopped/terminated。
    if (this._status !== 'stopped') return
    this._status = 'running'
    this._stopLocation = null
    this._onDidChangeState.fire()
    await window.electronAPI.debug.request(command, { threadId: this._threadId })
  }

  // ── 变量树（懒展开）────────────────────────────────────
  async setActiveFrame(frameId: number): Promise<void> {
    // 用户点击调用栈某一帧时，变量面板后续 scopes/evaluate 要使用这个 frameId。
    this._activeFrameId = frameId
    const frame = this._callStack.find(f => f.id === frameId)
    if (frame?.source?.path) this._stopLocation = { path: frame.source.path, line: frame.line }
    this._onDidChangeState.fire()
  }
  async getScopes(frameId: number): Promise<Scope[]> {
    // scopes 只有停住时才有意义；这里不缓存，DebugView 展开变量树时按需请求。
    const body = (await window.electronAPI.debug.request('scopes', { frameId })) as { scopes?: Scope[] }
    return body?.scopes ?? []
  }
  async getVariables(reference: number): Promise<Variable[]> {
    // variablesReference 是 adapter 给的“远程对象句柄”。
    // UI 不直接保存真实对象，只拿句柄再向 adapter 拉子节点。
    const body = (await window.electronAPI.debug.request('variables', {
      variablesReference: reference
    })) as { variables?: Variable[] }
    return body?.variables ?? []
  }
  async evaluate(expression: string, context: 'repl' | 'watch' = 'repl'): Promise<Variable> {
    // Debug Console / Watch 都走 DAP evaluate。
    // context='watch' 时通常不把输入写入 Debug Console。
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
    // main 会通过 webContents.send('debug:event') 推送 DAP event。
    // 这里订阅一次即可；服务生命周期跟 renderer 一样长。
    if (this._subscribed) return
    this._subscribed = true
    window.electronAPI.debug.onEvent(e => this._onEvent(e.event, e.body))
  }

  private async _onEvent(event: string, body: unknown): Promise<void> {
    if (event === 'stopped') {
      // stopped 只是告诉我们“某个线程停住了”，还不包含完整调用栈。
      // 所以收到 stopped 后，要主动再发 stackTrace 请求。
      const b = body as { threadId?: number }
      this._threadId = b.threadId ?? 1
      this._status = 'stopped'
      const st = (await window.electronAPI.debug.request('stackTrace', {
        threadId: this._threadId
      })) as { stackFrames?: StackFrame[] }
      this._callStack = st?.stackFrames ?? []
      const top = this._callStack[0]
      // 栈顶帧的位置就是编辑器黄色箭头要高亮的位置。
      this._activeFrameId = top?.id ?? null
      this._stopLocation = top?.source?.path ? { path: top.source.path, line: top.line } : null
      this._onDidChangeState.fire()
    } else if (event === 'continued') {
      // 程序继续运行后，黄色箭头要隐藏；旧调用栈不再可信。
      this._status = 'running'
      this._stopLocation = null
      this._onDidChangeState.fire()
    } else if (event === 'output') {
      // adapter/runtime 输出展示到 Debug Console。
      const b = body as { output?: string; category?: string }
      this._addConsoleEntry(b.category === 'stderr' ? 'error' : 'output', b.output ?? '')
    } else if (event === 'breakpoint') {
      // adapter 可能异步告诉我们某个断点 verified 状态变化。
      this._applyBreakpointEvent(body)
    } else if (event === 'terminated' || event === 'exited') {
      this._setInactive()
    }
  }

  private _setInactive(): void {
    this._status = 'inactive'
    this._callStack = []
    this._activeFrameId = null
    this._stopLocation = null
    this._activeSessionLabel = null
    this._onDidChangeState.fire()
  }

  private async _sendBreakpoints(path: string, lines: number[]): Promise<void> {
    try {
      // setBreakpoints 是“按文件覆盖”的语义：
      // 给 adapter 的是这个文件完整断点列表，而不是单个新增/删除。
      const body = await window.electronAPI.debug.setBreakpoints(path, lines)
      this._applyBreakpointResponse(path, body, lines)
    } catch (err) {
      this._addConsoleEntry('error', errorMessage(err))
      this.notificationService.notify('error', errorMessage(err))
    }
  }

  private _applyStartResult(result: unknown): void {
    // start 时 main 会把所有已存在断点的 verified 结果一次性返回。
    const r = result as { breakpointSets?: { path: string; breakpoints: DebugBreakpoint[] }[] } | undefined
    for (const set of r?.breakpointSets ?? []) {
      this._applyBreakpointResponse(set.path, { breakpoints: set.breakpoints }, this.getBreakpointLines(set.path))
    }
  }

  private _applyBreakpointResponse(path: string, body: unknown, requestedLines: number[]): void {
    // 把 adapter 返回的 breakpoints 映射回 UI 模型。
    // 如果 adapter 没回 line，就用原请求 line 兜底。
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

  private _applyBreakpointEvent(body: unknown): void {
    // DAP breakpoint event 是增量更新，常见于断点从 unverified 变 verified。
    const eventBody = body as { breakpoint?: DebugBreakpoint & { source?: { path?: string } } } | undefined
    const breakpoint = eventBody?.breakpoint
    const path = breakpoint?.source?.path
    const line = breakpoint?.line
    if (!path || typeof line !== 'number') return

    let details = this._breakpointDetails.get(path)
    if (!details) {
      details = new Map()
      this._breakpointDetails.set(path, details)
    }
    details.set(line, {
      line,
      verified: breakpoint.verified,
      message: breakpoint.message
    })
    this._onDidChangeBreakpoints.fire()
  }

  private _syncBreakpointDetails(path: string, lines: Set<number>): void {
    // 用户删掉断点后，旧的 verified/message 也要跟着清掉，避免 UI 显示过期状态。
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
    // 行为对齐 VS Code 的简化版：
    // 1. 工作区有 .vscode/launch.json：用第一个 configuration；
    // 2. 没有 launch.json 且当前文件是 JS/TS：默认真实 node/js-debug；
    // 3. 其它文件：退回 mock 教学 adapter。
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

    if (isNodeDebuggableFile(program)) {
      // 默认调试当前文件，cwd 取工作区根目录；没有工作区时取当前文件目录。
      const cwd = root ?? dirname(program)
      return {
        type: 'node',
        request: 'launch',
        name: 'Debug Current File',
        program,
        cwd
      }
    }

    return { type: 'mock', request: 'launch', program, name: 'Mock Debug' }
  }

  private async _readFirstLaunchConfig(root: string): Promise<DebugLaunchConfig | null> {
    // 当前先不做配置选择器，读取第一个 configuration。
    // 后续要对齐 VS Code，可以在这里接入 quick pick / compounds。
    const launchPath = `${root.replace(/\/$/, '')}/.vscode/launch.json`
    try {
      if (!(await window.electronAPI.fs.exists(launchPath))) return null
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
    // 只实现最常见的两个变量。真实 VS Code 的变量替换系统更完整。
    const root = this.workspaceService.root ?? ''
    const file = this.editorService.activePath ?? ''
    return replaceConfigVars(config, {
      workspaceFolder: root,
      file
    }) as DebugLaunchConfig
  }

  private _addConsoleEntry(kind: DebugConsoleEntry['kind'], text: string): void {
    // immutable 更新，保证 useEvent/useService 能感知引用变化并重新渲染。
    if (!text) return
    this._consoleEntries = [...this._consoleEntries, { id: ++this._consoleSeq, kind, text }]
    this._onDidChangeState.fire()
  }
}

registerSingleton(IDebugService, DebugService)

function stripJsonComments(input: string): string {
  // launch.json 允许注释，JSON.parse 不允许；这里做一个最小版注释剥离。
  return input
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

function replaceConfigVars(value: unknown, vars: Record<string, string>): unknown {
  // 递归替换对象/数组/字符串里的 ${workspaceFolder} 和 ${file}。
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

function isNodeDebuggableFile(path: string): boolean {
  // 没有 launch.json 时，这些文件默认走真实 js-debug，而不是 mock adapter。
  return /\.(?:cjs|cts|js|jsx|mjs|mts|ts|tsx)$/i.test(path)
}

function dirname(path: string): string {
  // renderer 不能 import Node path，这里用一个够用的 POSIX dirname。
  const trimmed = path.replace(/\/+$/, '')
  const index = trimmed.lastIndexOf('/')
  if (index > 0) return trimmed.slice(0, index)
  if (index === 0) return '/'
  return ''
}

function sessionLabelFor(config: DebugLaunchConfig): string {
  // 给 DebugView / Debug Console 展示当前 adapter 类型。
  // mock 特意标出来，避免学习时把模拟变量误认为真实 Node 变量。
  const type =
    typeof config.type === 'string'
      ? config.type
      : config.debugServer
        ? 'server'
        : config.adapterCommand
          ? 'custom'
          : 'mock'
  const name = typeof config.name === 'string' && config.name ? config.name : 'Debug'
  const label = `${type}: ${name}`
  return type === 'mock' ? `${label} (protocol teaching adapter; simulated values)` : label
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
