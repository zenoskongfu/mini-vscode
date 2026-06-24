import type { ExtHostCommandsShape } from '../platform/rpc/proxyIdentifiers'

type CommandHandler = (...args: unknown[]) => unknown

/**
 * ExtHostCommands — stores the command handlers an extension registered via
 * `vscode.commands.registerCommand`, and runs them when the workbench asks
 * (`$executeContributedCommand`). The renderer side is MainThreadCommands.
 *
 * Owner-aware: every handler is tagged with the registering extension's id, so
 * deactivation/uninstall can drop all of one extension's commands at once.
 */
export class ExtHostCommands implements ExtHostCommandsShape {
  private readonly _handlers = new Map<string, CommandHandler>()
  /** extensionId → the command ids it registered */
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

  /** Drop a single command (e.g. an extension disposed its registration) */
  unregister(id: string): void {
    this._handlers.delete(id)
    for (const owned of this._byExtension.values()) owned.delete(id)
  }

  /** Drop every command an extension registered; returns the removed ids */
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
