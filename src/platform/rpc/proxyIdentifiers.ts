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

// ── 语言特性相关 DTO（vscode 约定：行列均 0-based）──

export interface UriComponents {
  scheme: string
  path: string
}
export interface IPosition {
  line: number
  character: number
}
export interface IRange {
  start: IPosition
  end: IPosition
}
export interface ILocationDto {
  uri: UriComponents
  range: IRange
}

export interface MainThreadLanguageFeaturesShape {
  /** 扩展宿主注册了一个 definition provider（handle 寻址，selector 为 languageId 列表） */
  $registerDefinitionProvider(handle: number, selector: string[]): void
  /** 注销某 handle 的 provider */
  $unregisterProvider(handle: number): void
}

/** 一条诊断的跨 RPC 表示（range 为 vscode 0-based；severity 为 vscode 0..3） */
export interface IMarkerDto {
  range: IRange
  message: string
  severity: number
  source?: string
  code?: string
}

export interface MainThreadDiagnosticsShape {
  /** 按 owner 批量替换若干文件的诊断（名称照搬 VSCode MainThreadDiagnostics） */
  $changeMany(owner: string, entries: [UriComponents, IMarkerDto[]][]): void
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

export interface ExtHostDocumentsShape {
  /** 渲染层：某文档打开（含全文 + 语言 id） */
  $acceptModelOpened(uri: UriComponents, text: string, languageId: string): void
  /** 渲染层：某文档内容变化（v1 推送全文） */
  $acceptModelChanged(uri: UriComponents, text: string): void
  /** 渲染层：某文档关闭/释放 */
  $acceptModelClosed(uri: UriComponents): void
}

export interface ExtHostLanguageFeaturesShape {
  /** 运行某 handle 的 definition provider，返回归一后的 Location 列表 */
  $provideDefinition(handle: number, resource: UriComponents, position: IPosition): Promise<ILocationDto[]>
}

export const MainContext = {
  MainThreadCommands: 'MainThreadCommands',
  MainThreadMessageService: 'MainThreadMessageService',
  MainThreadExtensionService: 'MainThreadExtensionService',
  MainThreadLanguageFeatures: 'MainThreadLanguageFeatures',
  MainThreadDiagnostics: 'MainThreadDiagnostics'
} as const

export const ExtHostContext = {
  ExtHostExtensionService: 'ExtHostExtensionService',
  ExtHostCommands: 'ExtHostCommands',
  ExtHostDocuments: 'ExtHostDocuments',
  ExtHostLanguageFeatures: 'ExtHostLanguageFeatures'
} as const
