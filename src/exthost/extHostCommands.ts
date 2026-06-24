import type { ExtHostCommandsShape } from '../platform/rpc/proxyIdentifiers'

type CommandHandler = (...args: unknown[]) => unknown

/**
 * ExtHostCommands — stores the command handlers an extension registered via
 * `vscode.commands.registerCommand`, and runs them when the workbench asks
 * (`$executeContributedCommand`). The renderer side is MainThreadCommands.
 */
export class ExtHostCommands implements ExtHostCommandsShape {
  private readonly _handlers = new Map<string, CommandHandler>()

  registerCommand(id: string, handler: CommandHandler): void {
    this._handlers.set(id, handler)
  }

  async $executeContributedCommand(id: string, args: unknown[]): Promise<unknown> {
    const handler = this._handlers.get(id)
    if (!handler) {
      throw new Error(`[ExtHost] command not registered: ${id}`)
    }
    return await handler(...args)
  }
}
