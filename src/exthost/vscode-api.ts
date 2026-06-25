import { RPCProtocol } from '../platform/rpc/rpcProtocol'
import {
  MainContext,
  type MainThreadCommandsShape,
  type MainThreadMessageShape
} from '../platform/rpc/proxyIdentifiers'
import { ExtHostCommands } from './extHostCommands'
import { ExtHostUri } from './extHostDocuments'
import {
  ExtHostLanguageFeatures,
  Position,
  Range,
  Location,
  type DefinitionProvider
} from './extHostLanguageFeatures'

interface Disposable {
  dispose(): void
}

/** 语言选择器归一为 languageId 字符串数组 */
type LanguageSelector =
  | string
  | { language?: string }
  | Array<string | { language?: string }>
function normalizeSelector(selector: LanguageSelector): string[] {
  const one = (s: string | { language?: string }): string | undefined =>
    typeof s === 'string' ? s : s.language
  const list = Array.isArray(selector) ? selector : [selector]
  return list.map(one).filter((x): x is string => !!x)
}

/**
 * 构造注入到扩展中的 `vscode` API 对象。
 * 每次调用都会通过 RPC 通道代理到 renderer 里的 MainThread* 处理器，
 * 扩展永远不直接触碰 workbench（进程隔离）。
 */
export function createVSCodeApi(
  rpc: RPCProtocol,
  extHostCommands: ExtHostCommands,
  extHostLanguageFeatures: ExtHostLanguageFeatures,
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
        // dispose 时双向清理：本地处理器 + 通知 workbench 移除命令
        return {
          dispose: () => {
            extHostCommands.unregister(id)
            mainCommands.$unregisterCommand(id)
          }
        }
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
    languages: {
      registerDefinitionProvider(selector: LanguageSelector, provider: DefinitionProvider): Disposable {
        return extHostLanguageFeatures.registerDefinitionProvider(
          extensionId,
          normalizeSelector(selector),
          provider
        )
      }
    },
    workspace: {
      // 最小占位命名空间；后续 MainThread* 处理器增加时再扩展
      getConfiguration: () => ({ get: () => undefined })
    },
    // 扩展构造返回值用的值类型
    Uri: ExtHostUri,
    Position,
    Range,
    Location
  }
}
