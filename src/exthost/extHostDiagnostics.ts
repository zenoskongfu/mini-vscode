import { RPCProtocol } from '../platform/rpc/rpcProtocol'
import {
  MainContext,
  type MainThreadDiagnosticsShape,
  type IMarkerDto,
  type UriComponents
} from '../platform/rpc/proxyIdentifiers'
import { Range } from './extHostLanguageFeatures'

/** vscode.DiagnosticSeverity（注意：与 monaco 的枚举反序） */
export enum DiagnosticSeverity {
  Error = 0,
  Warning = 1,
  Information = 2,
  Hint = 3
}

/** 扩展构造的诊断对象 */
export class Diagnostic {
  source?: string
  code?: string
  constructor(
    public range: Range,
    public message: string,
    public severity: DiagnosticSeverity = DiagnosticSeverity.Error
  ) {}
}

function key(uri: UriComponents): string {
  return `${uri.scheme}:${uri.path}`
}

function toMarkerDto(d: Diagnostic): IMarkerDto {
  return {
    range: {
      start: { line: d.range.start.line, character: d.range.start.character },
      end: { line: d.range.end.line, character: d.range.end.character }
    },
    message: d.message,
    severity: d.severity ?? DiagnosticSeverity.Error,
    source: d.source,
    code: d.code
  }
}

/**
 * vscode.DiagnosticCollection —— 按 owner(name) 持有各文件诊断。
 * 任一变更都把「该次受影响的 [uri, markers] 列表」推给渲染层
 * （markers 为空 = 清空该文件该 owner 的诊断）。对应 VSCode 同名对象。
 */
export class DiagnosticCollection {
  /** pathKey → uri，记住哪些文件设过，clear/dispose 时好逐个清空 */
  private readonly _uris = new Map<string, UriComponents>()

  constructor(
    readonly name: string,
    private readonly push: (entries: [UriComponents, IMarkerDto[]][]) => void
  ) {}

  set(uri: UriComponents, diagnostics?: Diagnostic[]): void {
    const markers = (diagnostics ?? []).map(toMarkerDto)
    const k = key(uri)
    if (markers.length === 0) this._uris.delete(k)
    else this._uris.set(k, uri)
    this.push([[uri, markers]])
  }

  delete(uri: UriComponents): void {
    this._uris.delete(key(uri))
    this.push([[uri, []]])
  }

  clear(): void {
    const entries = [...this._uris.values()].map(u => [u, []] as [UriComponents, IMarkerDto[]])
    this._uris.clear()
    if (entries.length) this.push(entries)
  }

  dispose(): void {
    this.clear()
  }
}

/**
 * ExtHostDiagnostics —— 扩展宿主侧诊断管理（对应 VSCode ExtHostDiagnostics）。
 * createCollection → DiagnosticCollection；按扩展记账，停用时一次性清空。
 */
export class ExtHostDiagnostics {
  private readonly _mainProxy: MainThreadDiagnosticsShape
  private readonly _byExtension = new Map<string, DiagnosticCollection[]>()
  private _seq = 0

  constructor(rpc: RPCProtocol) {
    this._mainProxy = rpc.getProxy<MainThreadDiagnosticsShape>(MainContext.MainThreadDiagnostics)
  }

  createCollection(extensionId: string, name?: string): DiagnosticCollection {
    const owner = name || `ext-diag-${this._seq++}`
    const collection = new DiagnosticCollection(owner, entries =>
      this._mainProxy.$changeMany(owner, entries)
    )
    const owned = this._byExtension.get(extensionId) ?? []
    owned.push(collection)
    this._byExtension.set(extensionId, owned)
    return collection
  }

  /** 扩展停用时清空其所有诊断 */
  unregisterByExtension(extensionId: string): void {
    for (const col of this._byExtension.get(extensionId) ?? []) col.clear()
    this._byExtension.delete(extensionId)
  }
}
