/**
 * RPCProtocol：VSCode `vs/workbench/services/extensions/common/rpcProtocol.ts`
 * 的精简移植版。
 *
 * 两端（扩展宿主 ↔ renderer）都会基于一个消息通道创建 RPCProtocol。
 * 每一端都可以：
 *   - `set(id, instance)` 暴露一个可通过 `id` 寻址的本地对象
 *   - `getProxy(id)` 获取远端 stub，方法调用会被编组后跨通道发送，
 *     并用远端返回值完成 Promise
 *
 * 方法名沿用 VSCode 的 `$` 前缀约定（例如 `$registerCommand`）。
 */

/** DOM MessagePort 与 Electron MessagePortMain 都能满足的最小传输接口 */
export interface IMessagePassingProtocol {
  send(message: unknown): void
  onMessage(listener: (message: unknown) => void): void
}

type RequestMessage = {
  type: 'req'
  id: number
  proxyId: string
  method: string
  args: unknown[]
}
type ReplyMessage = {
  type: 'reply'
  id: number
  result?: unknown
  error?: string
}
type ProtocolMessage = RequestMessage | ReplyMessage

export class RPCProtocol {
  private readonly _locals = new Map<string, Record<string, unknown>>()
  private readonly _pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()
  private _lastId = 0

  constructor(private readonly _protocol: IMessagePassingProtocol) {
    this._protocol.onMessage(msg => this._receive(msg as ProtocolMessage))
  }

  /** 暴露一个可通过 `id` 寻址的本地实现 */
  set<T extends object>(id: string, instance: T): T {
    this._locals.set(id, instance as Record<string, unknown>)
    return instance
  }

  /** 获取远端代理；调用 `proxy.$foo(a, b)` 会通过通道编组发送 */
  getProxy<T extends object>(id: string): T {
    return new Proxy(Object.create(null), {
      get: (_target, method: string) => {
        return (...args: unknown[]): Promise<unknown> => this._remoteCall(id, method, args)
      }
    }) as T
  }

  private _remoteCall(proxyId: string, method: string, args: unknown[]): Promise<unknown> {
    const id = ++this._lastId
    return new Promise((resolve, reject) => {
      this._pending.set(id, { resolve, reject })
      this._protocol.send({ type: 'req', id, proxyId, method, args } satisfies RequestMessage)
    })
  }

  private async _receive(msg: ProtocolMessage): Promise<void> {
    if (msg.type === 'req') {
      const target = this._locals.get(msg.proxyId)
      const fn = target?.[msg.method]
      if (typeof fn !== 'function') {
        this._protocol.send({
          type: 'reply',
          id: msg.id,
          error: `[RPC] no handler for ${msg.proxyId}.${msg.method}`
        } satisfies ReplyMessage)
        return
      }
      try {
        const result = await (fn as (...a: unknown[]) => unknown).apply(target, msg.args)
        this._protocol.send({ type: 'reply', id: msg.id, result } satisfies ReplyMessage)
      } catch (e) {
        const error = e instanceof Error ? e.message : String(e)
        this._protocol.send({ type: 'reply', id: msg.id, error } satisfies ReplyMessage)
      }
      return
    }

    // 收到回复
    const pending = this._pending.get(msg.id)
    if (!pending) return
    this._pending.delete(msg.id)
    if (msg.error !== undefined) pending.reject(new Error(msg.error))
    else pending.resolve(msg.result)
  }
}
