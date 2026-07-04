/**
 * Phase 14 —— 最小 mock Debug Adapter（讲 DAP over stdio）。
 *
 * 它不真正运行程序，而是确定性地模拟一次调试会话：
 *   initialize → (event initialized) → setBreakpoints → launch + configurationDone
 *   → 停在第一个断点（stopped）→ stackTrace/scopes/variables → continue/next → …
 * 用来把「DAP 客户端 + DebugSession + 调试 UI」整条链路跑通；之后换 @vscode/js-debug
 * 只需改 DebugService 里 spawn 的命令，协议/UI 全部不动。
 *
 * 作为独立的 electron-vite main 入口构建 → out/main/mockDapAdapter.js，
 * 由主进程 DebugService 以 Node 模式 spawn（仿照 extensionHost）。
 */
import fs from 'node:fs'

let outSeq = 1
function send(msg: Record<string, unknown>): void {
  msg.seq = outSeq++
  const json = JSON.stringify(msg)
  process.stdout.write(`Content-Length: ${Buffer.byteLength(json, 'utf8')}\r\n\r\n${json}`)
}
interface DapRequest {
  seq: number
  command: string
  arguments?: Record<string, unknown>
}
function response(req: DapRequest, body?: unknown, success = true): void {
  send({ type: 'response', request_seq: req.seq, success, command: req.command, body })
}
function event(name: string, body?: unknown): void {
  send({ type: 'event', event: name, body })
}

const state = {
  programPath: '',
  maxLine: 1000,
  breakpoints: [] as number[],
  currentLine: 1,
  launched: false,
  configured: false
}

const base = (p: string): string => p.split('/').pop() || p

function stopAt(line: number, reason: string): void {
  state.currentLine = line
  event('stopped', { reason, threadId: 1, allThreadsStopped: true })
}

function maybeStart(): void {
  if (state.launched && state.configured) {
    if (state.breakpoints.length) stopAt(state.breakpoints[0], 'breakpoint')
    else stopAt(1, 'entry') // 没断点也停在第 1 行，方便观察/单步
  }
}

function variablesFor(ref: number): unknown[] {
  if (ref === 1000)
    return [
      { name: 'currentLine', value: String(state.currentLine), variablesReference: 0 },
      { name: 'message', value: '"hello from mock"', variablesReference: 0 },
      { name: 'counter', value: String(state.currentLine * 2), variablesReference: 0 },
      { name: 'obj', value: 'Object {a, b}', variablesReference: 1001 }
    ]
  if (ref === 1001)
    return [
      { name: 'a', value: '1', variablesReference: 0 },
      { name: 'b', value: 'true', variablesReference: 0 }
    ]
  if (ref === 2000)
    return [{ name: 'programDir', value: `"${state.programPath.replace(/\/[^/]*$/, '')}"`, variablesReference: 0 }]
  return []
}

function handle(req: DapRequest): void {
  const args = req.arguments ?? {}
  switch (req.command) {
    case 'initialize':
      response(req, { supportsConfigurationDoneRequest: true })
      event('initialized', {})
      break
    case 'setBreakpoints': {
      const source = (args.source as { path?: string }) ?? {}
      const bps = (args.breakpoints as { line: number }[]) ?? []
      const lines = bps.map(b => b.line)
      const acceptsSource = !state.programPath || source.path === state.programPath
      if (acceptsSource) {
        if (source.path) state.programPath = source.path
        state.breakpoints = [...lines].sort((a, b) => a - b)
      }
      response(req, {
        breakpoints: lines.map(line => ({
          verified: acceptsSource,
          line,
          message: acceptsSource ? undefined : 'mock adapter only stores breakpoints for the active program'
        }))
      })
      break
    }
    case 'launch':
      state.programPath = (args.program as string) || state.programPath
      try {
        state.maxLine = fs.readFileSync(state.programPath, 'utf8').split('\n').length
      } catch {
        state.maxLine = 1000
      }
      state.launched = true
      response(req)
      maybeStart()
      break
    case 'configurationDone':
      state.configured = true
      response(req)
      maybeStart()
      break
    case 'threads':
      response(req, { threads: [{ id: 1, name: 'main thread' }] })
      break
    case 'stackTrace':
      response(req, {
        stackFrames: [
          { id: 1, name: 'main', line: state.currentLine, column: 1, source: { name: base(state.programPath), path: state.programPath } },
          { id: 2, name: '(module)', line: 1, column: 1, source: { name: base(state.programPath), path: state.programPath } }
        ],
        totalFrames: 2
      })
      break
    case 'scopes':
      response(req, {
        scopes: [
          { name: 'Locals', variablesReference: 1000, expensive: false },
          { name: 'Globals', variablesReference: 2000, expensive: false }
        ]
      })
      break
    case 'variables':
      response(req, { variables: variablesFor((args.variablesReference as number) ?? 0) })
      break
    case 'continue': {
      response(req, { allThreadsContinued: true })
      event('continued', { threadId: 1 })
      const next = state.breakpoints.find(b => b > state.currentLine)
      if (next !== undefined) stopAt(next, 'breakpoint')
      else event('terminated', {})
      break
    }
    case 'next':
    case 'stepIn':
    case 'stepOut': {
      response(req)
      const nl = state.currentLine + 1
      if (nl > state.maxLine) event('terminated', {})
      else stopAt(nl, 'step')
      break
    }
    case 'evaluate':
      response(req, { result: `«mock» ${(args.expression as string) ?? ''}`, variablesReference: 0 })
      break
    case 'disconnect':
    case 'terminate':
      response(req)
      event('terminated', {})
      setTimeout(() => process.exit(0), 10)
      break
    default:
      response(req) // 未知命令 → 无害成功
  }
}

// stdin 分帧解析
let buf = Buffer.alloc(0)
let contentLen = -1
process.stdin.on('data', (chunk: Buffer) => {
  buf = Buffer.concat([buf, chunk])
  for (;;) {
    if (contentLen < 0) {
      const i = buf.indexOf('\r\n\r\n')
      if (i < 0) break
      const m = /Content-Length:\s*(\d+)/i.exec(buf.slice(0, i).toString('ascii'))
      contentLen = m ? parseInt(m[1], 10) : 0
      buf = buf.subarray(i + 4)
    }
    if (buf.length < contentLen) break
    const body = buf.subarray(0, contentLen).toString('utf8')
    buf = buf.subarray(contentLen)
    contentLen = -1
    try {
      handle(JSON.parse(body) as DapRequest)
    } catch {
      // 忽略坏帧
    }
  }
})
