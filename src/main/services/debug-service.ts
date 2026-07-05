import cp from 'child_process'
import fs from 'fs'
import net from 'net'
import path from 'path'
import type { BrowserWindow } from 'electron'
import { DebugSession, type DapAdapter, type DapIncomingRequest, type DapRequestResult } from '../debug/dap-session'

interface BreakpointSet {
  /** renderer 传来的一个文件的一组断点。 */
  path: string
  lines: number[]
}

interface LaunchConfig {
  /**
   * VS Code launch.json 里的配置形状。这里故意保持宽松：
   * js-debug 支持很多字段（args/env/runtimeExecutable/...），mini-vscode 不逐一建模，
   * 直接透传给 adapter。
   */
  type?: string
  request?: 'launch' | 'attach'
  program?: string
  name?: string
  cwd?: string
  debugServer?: number
  adapterHost?: string
  adapterCommand?: string
  adapterArgs?: string[]
  adapterEnv?: Record<string, string>
  adapterCwd?: string
  [key: string]: unknown
}

interface VerifiedBreakpoint {
  /** adapter 返回的断点验证结果：真实 adapter 可能会把断点挪行或标记为未验证。 */
  verified?: boolean
  line?: number
  message?: string
}

interface BreakpointSyncResult {
  /** start 时把已有断点发给 adapter 后，再把 verified 状态回流给 renderer。 */
  path: string
  breakpoints: VerifiedBreakpoint[]
}

interface DebugStartResult {
  breakpointSets: BreakpointSyncResult[]
}

/**
 * DebugService（main 进程）—— 选择 adapter + 驱动 DebugSession。
 *
 * renderer 只通过 IPC 调 start/request/setBreakpoints/stop；这里保留 main
 * 进程作为 mini 版 DAP client 的架构选择。真正的 DAP 分帧、pending
 * request、event fan-out 与 transport 生命周期由 DebugSession 负责。
 *
 * 和 VS Code 的关系可以这样看：
 * - renderer DebugService：像 VS Code 的 Debug UI/ViewModel，保存 UI 状态。
 * - main DebugService：像一个迷你版 DebugService + AdapterManager，选择并启动 adapter。
 * - DebugSession：像迷你版 RawDebugSession，专门处理 DAP 连接。
 *
 * 对 Node 调试来说，这里不会自己实现 node --inspect/CDP。
 * 正确链路是：mini-vscode(DAP client) -> js-debug(DAP server/adapter) -> Node Inspector。
 */
export class DebugService {
  /** 当前 UI 控制命令要发给哪个 session。真实 VS Code 会有更完整的 session/view model。 */
  private session: DebugSession | null = null
  /** root session 是最先连上的 js-debug session；js-debug 可能再要求创建 child session。 */
  private rootSession: DebugSession | null = null
  /** 当前所有打开的 DAP session，stop 时要统一断开。 */
  private readonly sessions = new Set<DebugSession>()
  private win: BrowserWindow | null = null
  /** 每个 session 注册 event/request listener 后，都把 dispose 函数放这里。 */
  private readonly sessionDisposables: Array<() => void> = []
  /** 由 main 自动启动的 js-debug DAP server 进程。mock adapter 不走这个字段。 */
  private managedAdapterProcess: cp.ChildProcessWithoutNullStreams | null = null
  /** child session 复用同一个 js-debug TCP server，所以要记住 active adapter。 */
  private activeAdapter: DapAdapter | null = null
  /** 用于 child session 启动后补发当前所有断点。 */
  private currentBreakpoints: BreakpointSet[] = []

  async start(win: BrowserWindow, config: LaunchConfig, breakpoints: BreakpointSet[]): Promise<DebugStartResult> {
    this.win = win
    // 同一时间先只允许一个 debug run；新的 F5 会清掉旧 session 和旧 adapter。
    await this.stop()
    // 保存一份断点快照。js-debug 的 child session 可能稍后才创建，需要再同步一次。
    this.currentBreakpoints = breakpoints.map(bp => ({ path: bp.path, lines: [...bp.lines] }))

    const adapter = await this.resolveAdapter(config)
    this.activeAdapter = adapter
    const session = new DebugSession(adapter)
    this.rootSession = session
    this.registerSession(session, true)
    try {
      await session.start()

      // 一定要先开始等 initialized，再发 initialize/launch。
      // 有些 adapter 事件来得很快，如果 launch 后才 wait，可能错过 initialized。
      const initialized = session.waitEvent('initialized', 15000)
      await session.request('initialize', {
        adapterID: dapAdapterID(config),
        linesStartAt1: true,
        columnsStartAt1: true,
        pathFormat: 'path'
      }, 15000)

      const dapConfig = toDapLaunchConfig(config)
      const startCommand = config.request === 'attach' ? 'attach' : 'launch'
      // launch/attach 的 response 可能要等程序启动完成，所以先把 Promise 留着。
      // 中间必须等 initialized 并发送断点/configurationDone。
      const started = session.request(startCommand, dapConfig, 30000)
      await initialized

      const breakpointSets: BreakpointSyncResult[] = []
      for (const bp of breakpoints) {
        // initialized 之后，IDE 才把当前断点配置发给 adapter。
        // adapter 会返回 verified 状态，renderer 用它决定红点是否实心/空心。
        const body = await session.request('setBreakpoints', {
          source: { path: bp.path, name: path.basename(bp.path) },
          breakpoints: bp.lines.map((line) => ({ line })),
        })
        breakpointSets.push({
          path: bp.path,
          breakpoints: normalizeBreakpoints(body, bp.lines)
        })
      }

      // 告诉 adapter：配置阶段结束，可以真正开始运行/继续被调试程序。
      await session.request('configurationDone', {}, 15000)
      await started
      return { breakpointSets }
    } catch (err) {
      await this.stop()
      throw err
    }
  }

  request(command: string, args?: unknown): Promise<unknown> {
    // renderer 的 continue/next/stackTrace/scopes/variables/evaluate 都会走这里。
    // 当前先发给 active session；多 session 完整模型后需要带 sessionId。
    if (!this.session) return Promise.resolve(undefined)
    return this.session.request(command, args)
  }

  async setBreakpoints(filePath: string, lines: number[]): Promise<{ breakpoints: VerifiedBreakpoint[] } | undefined> {
    // 用户在 UI 里新增/删除断点时，renderer 会同步到 main，再发给 adapter。
    // 现在只同步 active session；真实 VS Code 会按 session/model 更精细地广播。
    if (!this.session) return undefined
    const body = await this.session.request('setBreakpoints', {
      source: { path: filePath, name: path.basename(filePath) },
      breakpoints: lines.map((line) => ({ line })),
    })
    return { breakpoints: normalizeBreakpoints(body, lines) }
  }

  async stop(): Promise<void> {
    // stop 要做三件事：
    // 1. 清掉 main 保存的 session 状态；
    // 2. 对每条 DAP session 发 disconnect；
    // 3. 如果 js-debug server 是我们启动的，也把它停掉。
    this.session = null
    this.rootSession = null
    this.activeAdapter = null
    this.currentBreakpoints = []
    const sessions = [...this.sessions].reverse()
    this.sessions.clear()
    for (const dispose of this.sessionDisposables.splice(0)) dispose()
    for (const session of sessions) await session.disconnectAndStop()
    this.stopManagedAdapterProcess()
  }

  private registerSession(session: DebugSession, active: boolean): void {
    // 每个 DebugSession 都会把 DAP event 推给 renderer。
    // active=true 表示 UI 的 step/continue/evaluate 默认操作它。
    this.sessions.add(session)
    if (active) this.session = session
    this.sessionDisposables.push(
      session.onEvent((event, body) => this.forwardEvent(event, body)),
      session.onRequest(request => this.handleAdapterRequest(request))
    )
  }

  private async handleAdapterRequest(request: DapIncomingRequest): Promise<DapRequestResult | undefined> {
    // js-debug standalone 的常见流程：
    // root session 先接收 launch 配置，然后反向请求客户端 startDebugging；
    // 客户端再创建 child session，child session 才是真正连 Node Inspector 的那条。
    if (request.command !== 'startDebugging') return undefined
    await this.startChildDebugSession(request.arguments)
    return { body: {} }
  }

  private async startChildDebugSession(args: unknown): Promise<void> {
    // child session 复用同一个 js-debug DAP server，因此只支持 TCP adapter。
    // stdio 模式下每个 adapter 子进程只适合一条 session，这里暂不做。
    if (!this.activeAdapter || this.activeAdapter.kind !== 'tcp') {
      throw new Error('startDebugging is only supported for TCP debug adapters')
    }

    const startArgs = args as { request?: 'launch' | 'attach'; configuration?: LaunchConfig } | undefined
    const childConfig: LaunchConfig = {
      ...(startArgs?.configuration ?? {}),
      request: startArgs?.request ?? startArgs?.configuration?.request ?? 'launch'
    }

    const child = new DebugSession(this.activeAdapter)
    this.registerSession(child, true)
    await child.start()

    // child session 的握手流程和 root session 一样：
    // initialize -> launch/attach -> wait initialized -> setBreakpoints -> configurationDone。
    const initialized = child.waitEvent('initialized', 15000)
    await child.request('initialize', {
      adapterID: dapAdapterID(childConfig),
      linesStartAt1: true,
      columnsStartAt1: true,
      pathFormat: 'path'
    }, 15000)

    const startCommand = childConfig.request === 'attach' ? 'attach' : 'launch'
    const started = child.request(startCommand, toDapLaunchConfig(childConfig), 30000)
    await initialized
    for (const bp of this.currentBreakpoints) {
      // root session 上配置过的断点，child session 不会自动继承，必须重新发送。
      await child.request('setBreakpoints', {
        source: { path: bp.path, name: path.basename(bp.path) },
        breakpoints: bp.lines.map((line) => ({ line })),
      })
    }
    await child.request('configurationDone', {}, 15000)
    await started
  }

  private async resolveAdapter(config: LaunchConfig): Promise<DapAdapter> {
    // 1. launch.json 显式写 debugServer：说明外部已经启动了一个 DAP server。
    if (typeof config.debugServer === 'number') {
      return {
        kind: 'tcp',
        host: typeof config.adapterHost === 'string' ? config.adapterHost : 'localhost',
        port: config.debugServer
      }
    }

    // 2. launch.json 显式写 adapterCommand：让用户自己指定 stdio adapter。
    if (typeof config.adapterCommand === 'string' && config.adapterCommand.trim()) {
      return {
        kind: 'stdio',
        command: config.adapterCommand,
        args: Array.isArray(config.adapterArgs) ? config.adapterArgs.map(String) : [],
        cwd: typeof config.adapterCwd === 'string' ? config.adapterCwd : undefined,
        env: isStringRecord(config.adapterEnv) ? config.adapterEnv : undefined
      }
    }

    // 3. 没有真实 adapter 配置时，mock 仍保留为协议教学 adapter。
    // 它不会执行真实 JS，只会模拟 stopped/variables/next 等行为。
    if (!config.type || config.type === 'mock') {
      return {
        kind: 'stdio',
        command: process.execPath,
        args: [path.join(__dirname, 'mockDapAdapter.js')],
        env: { ELECTRON_RUN_AS_NODE: '1' }
      }
    }

    // 4. JS/Node 调试走微软 js-debug。
    // mini-vscode 只做 DAP client；真正启动 node --inspect / attach Inspector 的是 js-debug。
    if (config.type === 'node' || config.type === 'pwa-node') {
      return this.startManagedJsDebugServer()
    }

    throw new Error(
      `No debug adapter configured for type "${config.type}". ` +
      'Use "debugServer" for a standalone DAP server or "adapterCommand"/"adapterArgs" for a stdio adapter.'
    )
  }

  private forwardEvent(event: string, body: unknown): void {
    // DAP event 是 adapter -> main -> renderer 的单向推送。
    // 这里不要用 ipcRenderer.invoke，因为 event 没有“一问一答”的返回值。
    if (!this.win || this.win.isDestroyed()) return
    this.win.webContents.send('debug:event', { event, body })
  }

  private async startManagedJsDebugServer(): Promise<DapAdapter> {
    // js-debug standalone 是一个 DAP server 脚本：
    // node dapDebugServer.js <port>
    // 它监听端口后，DebugSession 再通过 TCP 连接过去。
    const serverPath = resolveJsDebugServerPath()
    const port = await getFreePort()
    const child = cp.spawn(process.execPath, [serverPath, String(port)], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      stdio: ['ignore', 'pipe', 'pipe']
    }) as unknown as cp.ChildProcessWithoutNullStreams

    this.managedAdapterProcess = child
    // server 自己的 stdout/stderr 不属于 DAP frame，
    // 但对调试接入很有价值，所以转成 output event 显示在 Debug Console。
    child.stdout.on('data', d => this.forwardEvent('output', {
      category: 'stdout',
      output: d.toString('utf8')
    }))
    child.stderr.on('data', d => this.forwardEvent('output', {
      category: 'stderr',
      output: d.toString('utf8')
    }))
    child.on('error', err => this.forwardEvent('output', {
      category: 'stderr',
      output: `[js-debug] failed to start DAP server: ${err.message}\n`
    }))
    child.on('exit', (code, signal) => {
      if (this.managedAdapterProcess !== child) return
      this.forwardEvent('output', {
        category: 'stderr',
        output: `[js-debug] DAP server exited (${code ?? signal ?? 'unknown'})\n`
      })
      this.managedAdapterProcess = null
    })

    return { kind: 'tcp', host: 'localhost', port }
  }

  private stopManagedAdapterProcess(): void {
    // 停掉 main 管理的 js-debug server。
    // 注意：如果用户通过 debugServer 连接外部 server，就不会进这里。
    const child = this.managedAdapterProcess
    this.managedAdapterProcess = null
    if (!child) return
    child.removeAllListeners()
    if (!child.killed) child.kill()
  }
}

function toDapLaunchConfig(config: LaunchConfig): Record<string, unknown> {
  // VS Code 新版 JS debugger 内部 adapter id 是 pwa-node。
  // 用户写 type: "node" 更符合直觉；发给 js-debug 前转换成它认识的 pwa-node。
  const {
    adapterCommand,
    adapterArgs,
    adapterEnv,
    adapterCwd,
    adapterHost,
    debugServer,
    ...dapConfig
  } = config
  if (dapConfig.type === 'node') {
    return { ...dapConfig, type: 'pwa-node' }
  }
  return dapConfig
}

function dapAdapterID(config: LaunchConfig): string {
  // initialize.adapterID 也要和 adapter 实际类型一致。
  return config.type === 'node' ? 'pwa-node' : config.type ?? 'mock'
}

function normalizeBreakpoints(body: unknown, requestedLines: number[]): VerifiedBreakpoint[] {
  // DAP setBreakpoints response 可能返回：
  // - verified: false，表示断点暂时无法绑定；
  // - line 改变，表示 adapter 把断点挪到了真正可停的位置；
  // - message，说明为什么不能绑定。
  const raw = body as { breakpoints?: VerifiedBreakpoint[] } | undefined
  if (Array.isArray(raw?.breakpoints)) {
    return raw.breakpoints.map((bp, i) => ({
      verified: bp.verified,
      line: typeof bp.line === 'number' ? bp.line : requestedLines[i],
      message: bp.message
    }))
  }
  return requestedLines.map(line => ({ verified: true, line }))
}

function isStringRecord(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  return Object.values(value).every(v => typeof v === 'string')
}

function resolveJsDebugServerPath(): string {
  // 开发调试时可以用环境变量指向任意 js-debug checkout/release。
  const envPath = process.env.MINI_VSCODE_JS_DEBUG_DAP
  if (envPath) {
    if (!fs.existsSync(envPath)) {
      throw new Error(`MINI_VSCODE_JS_DEBUG_DAP points to a missing file: ${envPath}`)
    }
    return envPath
  }

  const candidates = [
    // `pnpm debug:install-js-debug` 默认安装到这个位置。
    path.join(process.cwd(), 'vendor', 'js-debug-dap', 'js-debug', 'src', 'dapDebugServer.js')
  ]
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath
  if (resourcesPath) {
    // 打包后可把 js-debug 放到 resources 里，这里预留查找路径。
    candidates.push(path.join(resourcesPath, 'js-debug-dap', 'js-debug', 'src', 'dapDebugServer.js'))
  }

  const found = candidates.find(candidate => fs.existsSync(candidate))
  if (found) return found

  throw new Error(
    'js-debug DAP server is not installed. Run `pnpm debug:install-js-debug` ' +
    'or set MINI_VSCODE_JS_DEBUG_DAP to js-debug/src/dapDebugServer.js.'
  )
}

async function getFreePort(): Promise<number> {
  // 优先监听 IPv6 loopback。之前实测 js-debug 在某些环境会监听 ::1。
  try {
    return await getFreePortOn('::1')
  } catch {
    return getFreePortOn('127.0.0.1')
  }
}

function getFreePortOn(host: string): Promise<number> {
  // 让系统分配一个空闲端口：listen(0) 后读取实际 port，再立刻关闭。
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, host, () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      server.close(() => resolve(port))
    })
  })
}
