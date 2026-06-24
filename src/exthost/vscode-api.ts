import { RPCProtocol } from '../platform/rpc/rpcProtocol'
import {
  MainContext,
  type MainThreadCommandsShape,
  type MainThreadMessageShape
} from '../platform/rpc/proxyIdentifiers'
import { ExtHostCommands } from './extHostCommands'

interface Disposable {
  dispose(): void
}

/**
 * 构造注入到扩展中的 `vscode` API 对象。
 * 每次调用都会通过 RPC 通道代理到 renderer 里的 MainThread* 处理器，
 * 扩展永远不直接触碰 workbench（进程隔离）。
 */
export function createVSCodeApi(
  rpc: RPCProtocol,
  extHostCommands: ExtHostCommands,
  extensionId: string
): Record<string, unknown> {
  const mainCommands = rpc.getProxy<MainThreadCommandsShape>(MainContext.MainThreadCommands)
  const mainMessage = rpc.getProxy<MainThreadMessageShape>(MainContext.MainThreadMessageService)

  return {
    commands: {
      registerCommand(id: string, handler: (...args: unknown[]) => unknown): Disposable {
        extHostCommands.registerCommand(extensionId, id, handler)
        // 告诉 workbench：这个贡献命令现在已经有可调用的处理器
        mainCommands.$registerCommand(id)
        // 本地清理；RPC 侧注销（$unregisterCommand）留到 12.1 实现
        return { dispose: () => extHostCommands.unregister(id) }
      },
      executeCommand(id: string, ...args: unknown[]): Promise<unknown> {
        return mainCommands.$executeCommand(id, args)
      }
    },
    window: {
      showInformationMessage: (message: string): Promise<void> =>
        mainMessage.$showMessage('info', message),
      showWarningMessage: (message: string): Promise<void> =>
        mainMessage.$showMessage('warning', message),
      showErrorMessage: (message: string): Promise<void> =>
        mainMessage.$showMessage('error', message)
    },
    workspace: {
      // 最小占位命名空间；后续 MainThread* 处理器增加时再扩展
      getConfiguration: () => ({ get: () => undefined })
    }
  }
}
