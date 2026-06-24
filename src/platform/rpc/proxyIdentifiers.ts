/**
 * 两端共享的 Proxy 标识与 RPC 接口形状。
 *
 * MainContext.* 位于 RENDERER（类似 VSCode 的“主线程”侧 MainThread* 类）。
 * ExtHostContext.* 位于扩展宿主进程。
 * 方法名遵循 `$` 前缀约定。
 */

/** manifest 的 `contributes.commands` 中声明的贡献命令 */
export interface ContributedCommand {
  command: string
  title: string
  category?: string
}

/** workbench 关心的扩展 manifest 子集 */
export interface ExtensionDescription {
  id: string
  name: string
  displayName?: string
  main?: string
  activationEvents: string[]
  contributes: {
    commands?: ContributedCommand[]
  }
  extensionPath: string
}

// ── MainThread 侧（由 renderer 实现，供扩展宿主调用）──

export interface MainThreadCommandsShape {
  /** 扩展宿主注册了命令处理器（workbench 因而知道它已可用） */
  $registerCommand(id: string): void
  /** 扩展宿主释放了命令处理器 → 从 workbench 移除 */
  $unregisterCommand(id: string): void
  /** 扩展调用了 `vscode.commands.executeCommand` → 在 workbench 中执行 */
  $executeCommand(id: string, args: unknown[]): Promise<unknown>
}

export interface MainThreadMessageShape {
  $showMessage(severity: 'info' | 'warning' | 'error', message: string): Promise<void>
}

/** 扩展激活的生命周期状态，推送给 workbench（Extensions 视图用） */
export type ActivationState = 'activating' | 'active' | 'failed'

export interface MainThreadExtensionServiceShape {
  /** 扩展宿主改变了某扩展的激活状态 */
  $onDidChangeActivation(id: string, state: ActivationState): void
}

// ── ExtHost 侧（由扩展宿主实现，供 renderer 调用）──

export interface ExtHostExtensionServiceShape {
  /** 返回所有已发现的扩展 manifest */
  $getExtensions(): Promise<ExtensionDescription[]>
  /** 激活所有 activationEvents 包含 `event` 的扩展 */
  $activateByEvent(event: string): Promise<void>
  /** 重新读取扩展目录（安装/卸载后使用） */
  $rescan(): Promise<ExtensionDescription[]>
  /** 告诉宿主哪些扩展已禁用（跳过激活） */
  $setDisabledExtensions(ids: string[]): Promise<void>
  /** 停用扩展：调 deactivate、释放 subscriptions、反注册命令、清模块缓存 */
  $deactivate(id: string): Promise<void>
}

export interface ExtHostCommandsShape {
  /** 调用扩展注册的命令处理器 */
  $executeContributedCommand(id: string, args: unknown[]): Promise<unknown>
}

export const MainContext = {
  MainThreadCommands: 'MainThreadCommands',
  MainThreadMessageService: 'MainThreadMessageService',
  MainThreadExtensionService: 'MainThreadExtensionService'
} as const

export const ExtHostContext = {
  ExtHostExtensionService: 'ExtHostExtensionService',
  ExtHostCommands: 'ExtHostCommands'
} as const
