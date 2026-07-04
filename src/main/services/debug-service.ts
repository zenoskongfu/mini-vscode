import cp from 'child_process'
import fs from 'fs'
import net from 'net'
import path from 'path'
import type { BrowserWindow } from 'electron'
import { DebugSession, type DapAdapter, type DapIncomingRequest, type DapRequestResult } from '../debug/dap-session'

interface BreakpointSet {
  path: string
  lines: number[]
}

interface LaunchConfig {
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
  verified?: boolean
  line?: number
  message?: string
}

interface BreakpointSyncResult {
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
 */
export class DebugService {
  private session: DebugSession | null = null
  private rootSession: DebugSession | null = null
  private readonly sessions = new Set<DebugSession>()
  private win: BrowserWindow | null = null
  private readonly sessionDisposables: Array<() => void> = []
  private managedAdapterProcess: cp.ChildProcessWithoutNullStreams | null = null
  private activeAdapter: DapAdapter | null = null
  private currentBreakpoints: BreakpointSet[] = []

  async start(win: BrowserWindow, config: LaunchConfig, breakpoints: BreakpointSet[]): Promise<DebugStartResult> {
    this.win = win
    await this.stop()
    this.currentBreakpoints = breakpoints.map(bp => ({ path: bp.path, lines: [...bp.lines] }))

    const adapter = await this.resolveAdapter(config)
    this.activeAdapter = adapter
    const session = new DebugSession(adapter)
    this.rootSession = session
    this.registerSession(session, true)
    try {
      await session.start()

      const initialized = session.waitEvent('initialized', 15000)
      await session.request('initialize', {
        adapterID: dapAdapterID(config),
        linesStartAt1: true,
        columnsStartAt1: true,
        pathFormat: 'path'
      }, 15000)

      const dapConfig = toDapLaunchConfig(config)
      const startCommand = config.request === 'attach' ? 'attach' : 'launch'
      const started = session.request(startCommand, dapConfig, 30000)
      await initialized

      const breakpointSets: BreakpointSyncResult[] = []
      for (const bp of breakpoints) {
        const body = await session.request('setBreakpoints', {
          source: { path: bp.path, name: path.basename(bp.path) },
          breakpoints: bp.lines.map((line) => ({ line })),
        })
        breakpointSets.push({
          path: bp.path,
          breakpoints: normalizeBreakpoints(body, bp.lines)
        })
      }

      await session.request('configurationDone', {}, 15000)
      await started
      return { breakpointSets }
    } catch (err) {
      await this.stop()
      throw err
    }
  }

  request(command: string, args?: unknown): Promise<unknown> {
    if (!this.session) return Promise.resolve(undefined)
    return this.session.request(command, args)
  }

  async setBreakpoints(filePath: string, lines: number[]): Promise<{ breakpoints: VerifiedBreakpoint[] } | undefined> {
    if (!this.session) return undefined
    const body = await this.session.request('setBreakpoints', {
      source: { path: filePath, name: path.basename(filePath) },
      breakpoints: lines.map((line) => ({ line })),
    })
    return { breakpoints: normalizeBreakpoints(body, lines) }
  }

  async stop(): Promise<void> {
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
    this.sessions.add(session)
    if (active) this.session = session
    this.sessionDisposables.push(
      session.onEvent((event, body) => this.forwardEvent(event, body)),
      session.onRequest(request => this.handleAdapterRequest(request))
    )
  }

  private async handleAdapterRequest(request: DapIncomingRequest): Promise<DapRequestResult | undefined> {
    if (request.command !== 'startDebugging') return undefined
    await this.startChildDebugSession(request.arguments)
    return { body: {} }
  }

  private async startChildDebugSession(args: unknown): Promise<void> {
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
      await child.request('setBreakpoints', {
        source: { path: bp.path, name: path.basename(bp.path) },
        breakpoints: bp.lines.map((line) => ({ line })),
      })
    }
    await child.request('configurationDone', {}, 15000)
    await started
  }

  private async resolveAdapter(config: LaunchConfig): Promise<DapAdapter> {
    if (typeof config.debugServer === 'number') {
      return {
        kind: 'tcp',
        host: typeof config.adapterHost === 'string' ? config.adapterHost : 'localhost',
        port: config.debugServer
      }
    }

    if (typeof config.adapterCommand === 'string' && config.adapterCommand.trim()) {
      return {
        kind: 'stdio',
        command: config.adapterCommand,
        args: Array.isArray(config.adapterArgs) ? config.adapterArgs.map(String) : [],
        cwd: typeof config.adapterCwd === 'string' ? config.adapterCwd : undefined,
        env: isStringRecord(config.adapterEnv) ? config.adapterEnv : undefined
      }
    }

    if (!config.type || config.type === 'mock') {
      return {
        kind: 'stdio',
        command: process.execPath,
        args: [path.join(__dirname, 'mockDapAdapter.js')],
        env: { ELECTRON_RUN_AS_NODE: '1' }
      }
    }

    if (config.type === 'node' || config.type === 'pwa-node') {
      return this.startManagedJsDebugServer()
    }

    throw new Error(
      `No debug adapter configured for type "${config.type}". ` +
      'Use "debugServer" for a standalone DAP server or "adapterCommand"/"adapterArgs" for a stdio adapter.'
    )
  }

  private forwardEvent(event: string, body: unknown): void {
    if (!this.win || this.win.isDestroyed()) return
    this.win.webContents.send('debug:event', { event, body })
  }

  private async startManagedJsDebugServer(): Promise<DapAdapter> {
    const serverPath = resolveJsDebugServerPath()
    const port = await getFreePort()
    const child = cp.spawn(process.execPath, [serverPath, String(port)], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      stdio: ['ignore', 'pipe', 'pipe']
    }) as unknown as cp.ChildProcessWithoutNullStreams

    this.managedAdapterProcess = child
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
    const child = this.managedAdapterProcess
    this.managedAdapterProcess = null
    if (!child) return
    child.removeAllListeners()
    if (!child.killed) child.kill()
  }
}

function toDapLaunchConfig(config: LaunchConfig): Record<string, unknown> {
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
  return config.type === 'node' ? 'pwa-node' : config.type ?? 'mock'
}

function normalizeBreakpoints(body: unknown, requestedLines: number[]): VerifiedBreakpoint[] {
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
  const envPath = process.env.MINI_VSCODE_JS_DEBUG_DAP
  if (envPath) {
    if (!fs.existsSync(envPath)) {
      throw new Error(`MINI_VSCODE_JS_DEBUG_DAP points to a missing file: ${envPath}`)
    }
    return envPath
  }

  const candidates = [
    path.join(process.cwd(), 'vendor', 'js-debug-dap', 'js-debug', 'src', 'dapDebugServer.js')
  ]
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath
  if (resourcesPath) {
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
  try {
    return await getFreePortOn('::1')
  } catch {
    return getFreePortOn('127.0.0.1')
  }
}

function getFreePortOn(host: string): Promise<number> {
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
