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
 * Build the `vscode` API object injected into extensions.
 * Every call proxies across the RPC channel to a MainThread* handler in the
 * renderer — extensions never touch the workbench directly (process isolation).
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
        // Let the workbench know this contributed command now has a live handler
        mainCommands.$registerCommand(id)
        // Local cleanup; RPC-side unregister ($unregisterCommand) lands in 12.1
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
      // Minimal placeholder namespace; grows as more MainThread* handlers land
      getConfiguration: () => ({ get: () => undefined })
    }
  }
}
