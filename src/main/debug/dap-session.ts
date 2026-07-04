import cp from 'child_process'
import net from 'net'

export interface DapStdioAdapter {
  kind: 'stdio'
  command: string
  args?: string[]
  cwd?: string
  env?: Record<string, string>
}

export interface DapTcpAdapter {
  kind: 'tcp'
  host: string
  port: number
}

export type DapAdapter = DapStdioAdapter | DapTcpAdapter

interface PendingRequest {
  resolve: (body: unknown) => void
  reject: (err: Error) => void
  timer: NodeJS.Timeout
}

interface EventWaiter {
  name: string
  resolve: () => void
  reject: (err: Error) => void
  timer: NodeJS.Timeout
}

interface DapResponse {
  type: 'response'
  request_seq?: number
  success?: boolean
  command?: string
  message?: string
  body?: unknown
}

interface DapEvent {
  type: 'event'
  event?: string
  body?: unknown
}

interface DapRequest {
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
 * A small DAP session: owns one debug adapter transport, DAP framing,
 * request/response correlation, and event fan-out.
 */
export class DebugSession {
  private child: cp.ChildProcessWithoutNullStreams | null = null
  private socket: net.Socket | null = null
  private writable: NodeJS.WritableStream | null = null
  private readonly pending = new Map<number, PendingRequest>()
  private readonly eventWaiters: EventWaiter[] = []
  private readonly eventListeners = new Set<(event: string, body: unknown) => void>()
  private readonly requestListeners = new Set<(request: DapIncomingRequest) => Promise<DapRequestResult | undefined> | DapRequestResult | undefined>()
  private readonly seenEvents = new Set<string>()
  private seq = 1
  private buf = Buffer.alloc(0)
  private contentLen = -1
  private disposed = false

  constructor(private readonly adapter: DapAdapter) {}

  async start(): Promise<void> {
    if (this.adapter.kind === 'tcp') {
      await this.startTcp()
    } else {
      this.startStdio()
    }
  }

  onEvent(listener: (event: string, body: unknown) => void): () => void {
    this.eventListeners.add(listener)
    return () => this.eventListeners.delete(listener)
  }

  onRequest(
    listener: (request: DapIncomingRequest) => Promise<DapRequestResult | undefined> | DapRequestResult | undefined
  ): () => void {
    this.requestListeners.add(listener)
    return () => this.requestListeners.delete(listener)
  }

  waitEvent(name: string, ms = 10000): Promise<void> {
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
      this.send({ seq, type: 'request', command, arguments: args })
    })
  }

  async disconnectAndStop(): Promise<void> {
    if (this.disposed) return
    try {
      await this.request('disconnect', { terminateDebuggee: true }, 800)
    } catch {
      // The adapter may already be exiting. We still tear down the transport.
    }
    this.dispose(new DebugAdapterError('debug session stopped'))
  }

  dispose(reason = new DebugAdapterError('debug adapter exited')): void {
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
    const { command, args = [], cwd, env } = this.adapter as DapStdioAdapter
    const child = cp.spawn(command, args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe']
    }) as unknown as cp.ChildProcessWithoutNullStreams

    this.child = child
    this.writable = child.stdin
    child.stdout.on('data', (d) => this.onData(d))
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
    const json = JSON.stringify(msg)
    this.writable?.write(`Content-Length: ${Buffer.byteLength(json, 'utf8')}\r\n\r\n${json}`)
  }

  private onData(chunk: Buffer): void {
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
        this.handleMessage(JSON.parse(body) as DapMessage)
      } catch {
        // Ignore malformed adapter frames; the session remains alive.
      }
    }
  }

  private handleMessage(msg: DapMessage): void {
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
      this.sendResponse(request, false, undefined, `Unsupported adapter request: ${request.command}`)
    } catch (err) {
      this.sendResponse(request, false, undefined, err instanceof Error ? err.message : String(err))
    }
  }

  private sendResponse(request: DapIncomingRequest, success: boolean, body?: unknown, message?: string): void {
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
