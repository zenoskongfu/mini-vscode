import cp from 'child_process'
import net from 'net'

export interface DapStdioAdapter {
  /** 通过子进程 stdio 跟 adapter 通信：mock adapter 就是这种模式。 */
  kind: 'stdio'
  command: string
  args?: string[]
  cwd?: string
  env?: Record<string, string>
}

export interface DapTcpAdapter {
  /** 通过 TCP 端口跟 adapter 通信：js-debug standalone DAP server 就是这种模式。 */
  kind: 'tcp'
  host: string
  port: number
}

export type DapAdapter = DapStdioAdapter | DapTcpAdapter

interface PendingRequest {
  /**
   * DAP 的 request/response 是异步的一问一答。
   * 这里用 request 的 seq 作为 key，把 Promise 暂存起来；等 adapter 回 response
   * 时，再根据 response.request_seq 找回对应 Promise 并 resolve/reject。
   */
  resolve: (body: unknown) => void
  reject: (err: Error) => void
  timer: NodeJS.Timeout
}

interface EventWaiter {
  /** 等待某个 event，例如 initialize 后必须等 adapter 发 initialized。 */
  name: string
  resolve: () => void
  reject: (err: Error) => void
  timer: NodeJS.Timeout
}

interface DapResponse {
  /** response 是 adapter 对我们某个 request 的答复。 */
  type: 'response'
  /** 指向原 request 的 seq；靠它完成 request/response 配对。 */
  request_seq?: number
  success?: boolean
  command?: string
  message?: string
  body?: unknown
}

interface DapEvent {
  /** event 是 adapter 主动推给 IDE 的通知，例如 stopped/output/terminated。 */
  type: 'event'
  event?: string
  body?: unknown
}

interface DapRequest {
  /**
   * request 不一定只由 IDE 发给 adapter。
   * 真实 adapter 也可以反过来请求 IDE 做事，例如 js-debug 发 startDebugging。
   */
  type: 'request'
  seq?: number
  command?: string
  arguments?: unknown
}

export interface DapIncomingRequest {
  seq: number
  command: string
  arguments?: unknown
}

export interface DapRequestResult {
  body?: unknown
}

type DapMessage = DapResponse | DapEvent | DapRequest | { type?: string }

export class DebugAdapterError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DebugAdapterError'
  }
}

/**
 * 一个最小 DAP session。
 *
 * 你可以把它理解成“mini-vscode 和 debug adapter 之间的一条连接”：
 *
 * renderer(UI) -> main DebugService -> DebugSession -> debug adapter(js-debug/mock)
 *
 * 它只负责协议层的事情：
 * 1. 连接 adapter（stdio 或 TCP）。
 * 2. 按 DAP 的 `Content-Length: xxx\r\n\r\n{json}` 格式收发消息。
 * 3. 用 seq/request_seq 把 request 和 response 配对。
 * 4. 把 adapter 主动推来的 event 分发给上层。
 * 5. 处理 adapter 反向发来的 request，比如 js-debug 的 startDebugging。
 *
 * 它不理解“断点 UI 怎么显示”“变量树怎么渲染”，那些属于 renderer 的 DebugService。
 */
export class DebugSession {
  /** stdio adapter 的子进程，例如 mock-dap-adapter。 */
  private child: cp.ChildProcessWithoutNullStreams | null = null
  /** TCP adapter 的 socket，例如连接 js-debug standalone DAP server。 */
  private socket: net.Socket | null = null
  /** 当前真正可写入 DAP 消息的流，可能是 child.stdin，也可能是 socket。 */
  private writable: NodeJS.WritableStream | null = null
  private readonly pending = new Map<number, PendingRequest>()
  private readonly eventWaiters: EventWaiter[] = []
  private readonly eventListeners = new Set<(event: string, body: unknown) => void>()
  private readonly requestListeners = new Set<(request: DapIncomingRequest) => Promise<DapRequestResult | undefined> | DapRequestResult | undefined>()
  private readonly seenEvents = new Set<string>()
  /** DAP 消息序号，每发一个 request/response 都递增。 */
  private seq = 1
  /** TCP/stdio 都是字节流，可能半包/粘包，所以要自己缓存再按 Content-Length 拆包。 */
  private buf = Buffer.alloc(0)
  /** 当前正在等待的 JSON body 长度；-1 表示还没读到 header。 */
  private contentLen = -1
  private disposed = false

  constructor(private readonly adapter: DapAdapter) {}

  async start(): Promise<void> {
    // adapter 是“怎么连接”的配置；真正的 DAP 消息格式两种传输都一样。
    if (this.adapter.kind === 'tcp') {
      await this.startTcp()
    } else {
      this.startStdio()
    }
  }

  onEvent(listener: (event: string, body: unknown) => void): () => void {
    // 上层 main DebugService 用它订阅 stopped/output/terminated 等 DAP event。
    this.eventListeners.add(listener)
    return () => this.eventListeners.delete(listener)
  }

  onRequest(
    listener: (request: DapIncomingRequest) => Promise<DapRequestResult | undefined> | DapRequestResult | undefined
  ): () => void {
    // 上层 main DebugService 用它处理 adapter 反向 request。
    // 例如 js-debug root session 会要求客户端 startDebugging 一个 child session。
    this.requestListeners.add(listener)
    return () => this.requestListeners.delete(listener)
  }

  waitEvent(name: string, ms = 10000): Promise<void> {
    // 避免竞态：如果 event 在调用 waitEvent 前已经发生，直接 resolve。
    // 这对 initialized 很关键，因为有些 adapter 回得非常快。
    if (this.seenEvents.has(name)) return Promise.resolve()
    return new Promise((resolve, reject) => {
      const waiter: EventWaiter = {
        name,
        resolve,
        reject,
        timer: setTimeout(() => {
          this.removeWaiter(waiter)
          reject(new DebugAdapterError(`debug: timeout waiting ${name}`))
        }, ms)
      }
      this.eventWaiters.push(waiter)
    })
  }

  request(command: string, args?: unknown, ms = 10000): Promise<unknown> {
    // 这里是“IDE -> adapter”的 DAP request 入口：
    // initialize、launch、setBreakpoints、stackTrace、variables 都从这里出去。
    if (this.disposed || !this.writable) {
      return Promise.reject(new DebugAdapterError('debug adapter is not running'))
    }

    const seq = this.seq++
    return new Promise((resolve, reject) => {
      const pending: PendingRequest = {
        resolve,
        reject,
        timer: setTimeout(() => {
          this.pending.delete(seq)
          reject(new DebugAdapterError(`debug: timeout request ${command}`))
        }, ms)
      }
      this.pending.set(seq, pending)
      // 注意：send 只负责写字节；Promise 的完成要等 handleResponse。
      this.send({ seq, type: 'request', command, arguments: args })
    })
  }

  async disconnectAndStop(): Promise<void> {
    // VS Code 会根据 capabilities 区分 terminate/disconnect。
    // 这里先做最小实现：告诉 adapter 断开，并要求终止被调试程序。
    if (this.disposed) return
    try {
      await this.request('disconnect', { terminateDebuggee: true }, 800)
    } catch {
      // The adapter may already be exiting. We still tear down the transport.
    }
    this.dispose(new DebugAdapterError('debug session stopped'))
  }

  dispose(reason = new DebugAdapterError('debug adapter exited')): void {
    // dispose 是“无论正常/异常，都把这条连接彻底收掉”。
    // 必须 reject 所有 pending request，否则 renderer 可能一直等 Promise。
    if (this.disposed) return
    this.disposed = true
    this.writable = null

    if (this.child) {
      this.child.removeAllListeners()
      this.child.kill()
      this.child = null
    }
    if (this.socket) {
      this.socket.removeAllListeners()
      this.socket.destroy()
      this.socket = null
    }

    this.rejectAll(reason)
    this.buf = Buffer.alloc(0)
    this.contentLen = -1
  }

  private startStdio(): void {
    // stdio 模式：我们直接启动 adapter 子进程，并把 DAP JSON 消息写到 stdin，
    // 从 stdout 读取。DAP 用 Content-Length 分帧，但不是 JSON-RPC 2.0。
    const { command, args = [], cwd, env } = this.adapter as DapStdioAdapter
    const child = cp.spawn(command, args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe']
    }) as unknown as cp.ChildProcessWithoutNullStreams

    this.child = child
    this.writable = child.stdin
    child.stdout.on('data', (d) => this.onData(d))
    // adapter 的 stderr 不是 DAP frame，这里转成 output event 给 Debug Console 看。
    child.stderr.on('data', (d) => this.emitEvent('output', {
      category: 'stderr',
      output: d.toString('utf8')
    }))
    child.on('error', (err) => this.dispose(asAdapterError(err)))
    child.on('exit', (code, signal) => {
      this.emitEvent('exited', { exitCode: code, signal })
      this.dispose(new DebugAdapterError(`debug adapter exited (${code ?? signal ?? 'unknown'})`))
    })
  }

  private async startTcp(): Promise<void> {
    // TCP 模式：js-debug standalone 先监听一个端口，我们再用 socket 连过去。
    // 注意 macOS/Node 下 localhost 可能解析到 ::1 或 127.0.0.1，所以这里会重试。
    const { host, port } = this.adapter as DapTcpAdapter
    const hosts = localConnectionHosts(host)
    const start = Date.now()
    let lastError: unknown
    let lastHost = host
    while (!this.disposed && Date.now() - start < 8000) {
      for (const candidateHost of hosts) {
        try {
          const socket = await connectTcpSocket(candidateHost, port)
          this.socket = socket
          this.writable = socket
          socket.on('data', (d) => this.onData(d))
          socket.on('error', (err) => this.dispose(asAdapterError(err)))
          socket.on('close', () => this.dispose(new DebugAdapterError('debug adapter connection closed')))
          return
        } catch (err) {
          lastError = err
          lastHost = candidateHost
        }
      }
      await delay(100)
    }
    const message = lastError instanceof Error ? lastError.message : String(lastError)
    throw new DebugAdapterError(
      `debug adapter connection failed on ${hosts.join(' or ')}:${port} (last ${lastHost}): ${message}`
    )
  }

  private send(msg: Record<string, unknown>): void {
    // DAP 不是直接写一段 JSON。
    // 它像 HTTP 一样先写 header，告诉对方 JSON body 有多少字节：
    // Content-Length: 123\r\n\r\n{"seq":1,...}
    const json = JSON.stringify(msg)
    this.writable?.write(`Content-Length: ${Buffer.byteLength(json, 'utf8')}\r\n\r\n${json}`)
  }

  private onData(chunk: Buffer): void {
    // stdout/socket 给我们的只是“字节块”，不保证一次 data 就是一条完整 DAP 消息。
    // 所以这里实现一个小 parser：先读 header，再按 Content-Length 读 body。
    this.buf = Buffer.concat([this.buf, chunk])
    for (;;) {
      if (this.contentLen < 0) {
        const i = this.buf.indexOf('\r\n\r\n')
        if (i < 0) break
        const m = /Content-Length:\s*(\d+)/i.exec(this.buf.subarray(0, i).toString('ascii'))
        this.contentLen = m ? parseInt(m[1], 10) : 0
        this.buf = this.buf.subarray(i + 4)
      }
      if (this.buf.length < this.contentLen) break
      const body = this.buf.subarray(0, this.contentLen).toString('utf8')
      this.buf = this.buf.subarray(this.contentLen)
      this.contentLen = -1

      try {
        // body 是完整 JSON 后，才进入 DAP 语义层。
        this.handleMessage(JSON.parse(body) as DapMessage)
      } catch {
        // Ignore malformed adapter frames; the session remains alive.
      }
    }
  }

  private handleMessage(msg: DapMessage): void {
    // DAP 消息有三类：
    // response：回答我们之前的 request；
    // event：adapter 主动通知状态变化；
    // request：adapter 反过来要求 IDE 做事。
    if (msg.type === 'response') {
      this.handleResponse(msg as DapResponse)
    } else if (msg.type === 'event') {
      const event = (msg as DapEvent).event
      if (event) this.emitEvent(event, (msg as DapEvent).body)
    } else if (msg.type === 'request') {
      void this.handleAdapterRequest(msg as DapRequest)
    }
  }

  private handleResponse(msg: DapResponse): void {
    // response.request_seq 对应 request.seq。
    // 找不到 pending 说明请求可能已超时，或者 adapter 回了未知响应，直接忽略。
    if (msg.request_seq === undefined) return
    const pending = this.pending.get(msg.request_seq)
    if (!pending) return
    this.pending.delete(msg.request_seq)
    clearTimeout(pending.timer)

    if (msg.success === false) {
      pending.reject(new DebugAdapterError(msg.message || `${msg.command ?? 'request'} failed`))
    } else {
      pending.resolve(msg.body)
    }
  }

  private emitEvent(event: string, body: unknown): void {
    // event 是“广播式”的：可能有人在 waitEvent，也可能有长期 listener。
    // 例如 start 流程会 wait initialized；renderer 会长期监听 stopped/output。
    this.seenEvents.add(event)
    for (let i = this.eventWaiters.length - 1; i >= 0; i--) {
      const waiter = this.eventWaiters[i]
      if (waiter.name !== event) continue
      this.eventWaiters.splice(i, 1)
      clearTimeout(waiter.timer)
      waiter.resolve()
    }
    this.eventListeners.forEach(listener => listener(event, body))
  }

  private async handleAdapterRequest(msg: DapRequest): Promise<void> {
    // 真实 adapter 也会给客户端发 request。
    // 对 js-debug 来说，最重要的是 startDebugging：root session 要求 IDE
    // 再创建一个 child debug session 去真正 launch/attach Node。
    if (msg.seq === undefined || !msg.command) return

    const request: DapIncomingRequest = {
      seq: msg.seq,
      command: msg.command,
      arguments: msg.arguments
    }

    try {
      for (const listener of this.requestListeners) {
        const result = await listener(request)
        if (result !== undefined) {
          this.sendResponse(request, true, result.body)
          return
        }
      }
      // 目前没有实现 runInTerminal 等更完整的 VS Code 能力，所以未知 request 明确失败。
      this.sendResponse(request, false, undefined, `Unsupported adapter request: ${request.command}`)
    } catch (err) {
      this.sendResponse(request, false, undefined, err instanceof Error ? err.message : String(err))
    }
  }

  private sendResponse(request: DapIncomingRequest, success: boolean, body?: unknown, message?: string): void {
    // 这是“adapter -> IDE request”的答复，方向刚好和 request() 里的 response 相反。
    this.send({
      seq: this.seq++,
      type: 'response',
      request_seq: request.seq,
      command: request.command,
      success,
      body,
      message
    })
  }

  private removeWaiter(waiter: EventWaiter): void {
    const i = this.eventWaiters.indexOf(waiter)
    if (i >= 0) this.eventWaiters.splice(i, 1)
  }

  private rejectAll(reason: Error): void {
    // 连接断开时，所有还在等 response/event 的 Promise 都必须失败。
    // 否则 UI 会出现“按钮灰了、状态 running、但永远不回来”的假死。
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(reason)
    }
    this.pending.clear()

    for (const waiter of this.eventWaiters) {
      clearTimeout(waiter.timer)
      waiter.reject(reason)
    }
    this.eventWaiters.length = 0
  }
}

function asAdapterError(err: unknown): DebugAdapterError {
  if (err instanceof Error) return new DebugAdapterError(err.message)
  return new DebugAdapterError(String(err))
}

function connectTcpSocket(host: string, port: number): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port })
    const onError = (err: Error): void => {
      socket.destroy()
      reject(err)
    }
    socket.once('error', onError)
    socket.once('connect', () => {
      socket.off('error', onError)
      resolve(socket)
    })
  })
}

function localConnectionHosts(host: string): string[] {
  if (host === 'localhost') return ['localhost', '::1', '127.0.0.1']
  if (host === '127.0.0.1') return ['127.0.0.1', '::1']
  if (host === '::1') return ['::1', '127.0.0.1']
  return [host]
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
