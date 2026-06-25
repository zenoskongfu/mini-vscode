import { RPCProtocol } from '../platform/rpc/rpcProtocol'
import {
  MainContext,
  type MainThreadLanguageFeaturesShape,
  type ExtHostLanguageFeaturesShape,
  type ILocationDto,
  type IPosition,
  type UriComponents
} from '../platform/rpc/proxyIdentifiers'
import { ExtHostDocuments, ExtHostTextDocument, ExtHostUri } from './extHostDocuments'

// ── 提供给扩展构造返回值的最小 vscode 值类型（行列 0-based）──

export class Position {
  constructor(
    readonly line: number,
    readonly character: number
  ) {}
}

export class Range {
  readonly start: Position
  readonly end: Position
  constructor(
    startLine: number | Position,
    startChar: number | Position,
    endLine?: number,
    endChar?: number
  ) {
    if (startLine instanceof Position && startChar instanceof Position) {
      this.start = startLine
      this.end = startChar
    } else {
      this.start = new Position(startLine as number, startChar as number)
      this.end = new Position(endLine as number, endChar as number)
    }
  }
}

export class Location {
  constructor(
    readonly uri: ExtHostUri,
    readonly range: Range
  ) {}
}

type ProviderResult<T> = T | undefined | null | Promise<T | undefined | null>

export interface DefinitionProvider {
  provideDefinition(
    document: ExtHostTextDocument,
    position: Position
  ): ProviderResult<Location | Location[]>
}

/**
 * ExtHostLanguageFeatures —— 扩展宿主侧的语言特性 provider 注册表（Phase 13.2）。
 * 对应 VSCode 的 ExtHostLanguageFeatures：按 handle 持有 provider，被渲染层
 * (`MainThreadLanguageFeatures`) 通过 `$provide*` 调用时执行真正的 provider 逻辑。
 * owner 感知（按扩展记 handle），停用时一次性注销（复用 12.x 思路）。
 */
export class ExtHostLanguageFeatures implements ExtHostLanguageFeaturesShape {
  private _nextHandle = 0
  private readonly _providers = new Map<number, DefinitionProvider>()
  private readonly _byExtension = new Map<string, number[]>()
  private readonly _mainProxy: MainThreadLanguageFeaturesShape

  constructor(
    rpc: RPCProtocol,
    private readonly documents: ExtHostDocuments
  ) {
    this._mainProxy = rpc.getProxy<MainThreadLanguageFeaturesShape>(MainContext.MainThreadLanguageFeatures)
  }

  registerDefinitionProvider(
    extensionId: string,
    selector: string[],
    provider: DefinitionProvider
  ): { dispose(): void } {
    const handle = this._nextHandle++
    this._providers.set(handle, provider)
    const owned = this._byExtension.get(extensionId) ?? []
    owned.push(handle)
    this._byExtension.set(extensionId, owned)
    this._mainProxy.$registerDefinitionProvider(handle, selector)
    return { dispose: () => this._unregister(extensionId, handle) }
  }

  private _unregister(extensionId: string, handle: number): void {
    this._providers.delete(handle)
    const owned = this._byExtension.get(extensionId)
    if (owned) {
      const i = owned.indexOf(handle)
      if (i >= 0) owned.splice(i, 1)
    }
    this._mainProxy.$unregisterProvider(handle)
  }

  /** 扩展停用时：注销其全部 provider（并通知渲染层） */
  unregisterByExtension(extensionId: string): void {
    for (const handle of this._byExtension.get(extensionId) ?? []) {
      this._providers.delete(handle)
      this._mainProxy.$unregisterProvider(handle)
    }
    this._byExtension.delete(extensionId)
  }

  async $provideDefinition(
    handle: number,
    resource: UriComponents,
    position: IPosition
  ): Promise<ILocationDto[]> {
    const provider = this._providers.get(handle)
    if (!provider) return []
    const doc = this.documents.getDocument(resource)
    const result = await provider.provideDefinition(doc, new Position(position.line, position.character))
    if (!result) return []
    const locations = Array.isArray(result) ? result : [result]
    return locations.map(loc => ({
      uri: loc.uri.toJSON(),
      range: {
        start: { line: loc.range.start.line, character: loc.range.start.character },
        end: { line: loc.range.end.line, character: loc.range.end.character }
      }
    }))
  }
}
