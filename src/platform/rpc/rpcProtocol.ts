/**
 * RPCProtocol — trimmed-down port of VSCode's `vs/workbench/services/extensions/common/rpcProtocol.ts`.
 *
 * Both ends (ext host ↔ renderer) build an RPCProtocol over a message channel.
 * Each side can:
 *   - `set(id, instance)` to expose a local object addressable by `id`
 *   - `getProxy(id)` to get a remote stub whose method calls are marshalled
 *     across the channel and resolved with the remote return value.
 *
 * Method names follow VSCode's `$`-prefix convention (e.g. `$registerCommand`).
 */

/** Minimal transport both a DOM MessagePort and an Electron MessagePortMain can satisfy */
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

  /** Expose a local implementation addressable by `id` */
  set<T extends object>(id: string, instance: T): T {
    this._locals.set(id, instance as Record<string, unknown>)
    return instance
  }

  /** Get a remote proxy; calling `proxy.$foo(a, b)` marshals across the channel */
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

    // reply
    const pending = this._pending.get(msg.id)
    if (!pending) return
    this._pending.delete(msg.id)
    if (msg.error !== undefined) pending.reject(new Error(msg.error))
    else pending.resolve(msg.result)
  }
}
