import { createDecorator } from '../../instantiation/instantiation'
import { registerSingleton } from '../../instantiation/extensions'
import { Emitter, Event } from '../../base/event'
import { IDisposable, toDisposable } from '../../base/lifecycle'

/** A command — id + display metadata + handler (VSCode CommandsRegistry analog) */
export interface ICommand {
  id: string
  title: string
  category?: string
  handler: (...args: unknown[]) => unknown | Promise<unknown>
}

export interface ICommandService {
  readonly _serviceBrand: undefined

  /** Fires when a command is registered (palette listens to refresh) */
  readonly onDidRegisterCommand: Event<string>

  registerCommand(command: ICommand): IDisposable
  executeCommand<T = unknown>(id: string, ...args: unknown[]): Promise<T | undefined>
  getCommands(): ICommand[]
  getCommand(id: string): ICommand | undefined
}

export const ICommandService = createDecorator<ICommandService>('commandService')

/**
 * CommandService — central registry that maps command ids to handlers,
 * mirroring VSCode's CommandsRegistry + ICommandService. Both the Command
 * Palette and the KeybindingService dispatch through executeCommand().
 */
export class CommandService implements ICommandService {
  declare readonly _serviceBrand: undefined

  private readonly _commands = new Map<string, ICommand>()

  private readonly _onDidRegisterCommand = new Emitter<string>()
  readonly onDidRegisterCommand = this._onDidRegisterCommand.event

  registerCommand(command: ICommand): IDisposable {
    this._commands.set(command.id, command)
    this._onDidRegisterCommand.fire(command.id)
    return toDisposable(() => this._commands.delete(command.id))
  }

  async executeCommand<T = unknown>(id: string, ...args: unknown[]): Promise<T | undefined> {
    const command = this._commands.get(id)
    if (!command) {
      console.warn(`[CommandService] command not found: ${id}`)
      return undefined
    }
    return (await command.handler(...args)) as T
  }

  getCommands(): ICommand[] {
    return [...this._commands.values()]
  }

  getCommand(id: string): ICommand | undefined {
    return this._commands.get(id)
  }
}

registerSingleton(ICommandService, CommandService)
