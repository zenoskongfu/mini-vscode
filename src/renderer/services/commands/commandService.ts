import { createDecorator } from '../../instantiation/instantiation'
import { registerSingleton } from '../../instantiation/extensions'
import { Emitter, Event } from '../../base/event'
import { IDisposable, toDisposable } from '../../base/lifecycle'

/** 一个命令：id + 展示元数据 + 处理器（对应 VSCode CommandsRegistry） */
export interface ICommand {
  id: string
  title: string
  category?: string
  handler: (...args: unknown[]) => unknown | Promise<unknown>
}

export interface ICommandService {
  readonly _serviceBrand: undefined

  /** 命令注册时触发（命令面板会监听它来刷新） */
  readonly onDidRegisterCommand: Event<string>

  registerCommand(command: ICommand): IDisposable
  executeCommand<T = unknown>(id: string, ...args: unknown[]): Promise<T | undefined>
  getCommands(): ICommand[]
  getCommand(id: string): ICommand | undefined
}

export const ICommandService = createDecorator<ICommandService>('commandService')

/**
 * CommandService：command id 到 handler 的中心注册表，
 * 对应 VSCode 的 CommandsRegistry + ICommandService。
 * 命令面板和 KeybindingService 都通过 executeCommand() 分发。
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
