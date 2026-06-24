import type { ExtHostCommandsShape } from '../platform/rpc/proxyIdentifiers'

type CommandHandler = (...args: unknown[]) => unknown

/**
 * ExtHostCommands — 保存扩展通过 `vscode.commands.registerCommand` 注册的
 * 命令处理器，并在 workbench 请求时执行它们
 * （`$executeContributedCommand`）。renderer 侧对应 MainThreadCommands。
 *
 * 感知所属扩展：每个处理器都会带上注册扩展 id，
 * 这样停用/卸载时可以一次性移除该扩展的所有命令。
 */
export class ExtHostCommands implements ExtHostCommandsShape {
  private readonly _handlers = new Map<string, CommandHandler>()
  /** extensionId → 它注册过的命令 id */
  private readonly _byExtension = new Map<string, Set<string>>()

  registerCommand(extensionId: string, id: string, handler: CommandHandler): void {
    this._handlers.set(id, handler)
    let owned = this._byExtension.get(extensionId)
    if (!owned) {
      owned = new Set<string>()
      this._byExtension.set(extensionId, owned)
    }
    owned.add(id)
  }

  /** 移除单个命令（例如扩展 dispose 了自己的注册） */
  unregister(id: string): void {
    this._handlers.delete(id)
    for (const owned of this._byExtension.values()) owned.delete(id)
  }

  /** 移除某个扩展注册过的所有命令，并返回被移除的 id */
  unregisterByExtension(extensionId: string): string[] {
    const owned = this._byExtension.get(extensionId)
    if (!owned) return []
    const ids = [...owned]
    for (const id of ids) this._handlers.delete(id)
    this._byExtension.delete(extensionId)
    return ids
  }

  async $executeContributedCommand(id: string, args: unknown[]): Promise<unknown> {
    const handler = this._handlers.get(id)
    if (!handler) {
      throw new Error(`[ExtHost] command not registered: ${id}`)
    }
    return await handler(...args)
  }
}
