import type { ExtHostDocumentsShape, UriComponents } from '../platform/rpc/proxyIdentifiers'

/** uri 唯一键 */
function key(uri: UriComponents): string {
  return `${uri.scheme}:${uri.path}`
}

/** 最小 vscode.Uri（纯对象表示，scheme + path） */
export class ExtHostUri {
  constructor(
    readonly scheme: string,
    readonly path: string
  ) {}
  static file(path: string): ExtHostUri {
    return new ExtHostUri('file', path)
  }
  static from(c: UriComponents): ExtHostUri {
    return new ExtHostUri(c.scheme, c.path)
  }
  toString(): string {
    return `${this.scheme}://${this.path}`
  }
  toJSON(): UriComponents {
    return { scheme: this.scheme, path: this.path }
  }
}

/** 提供给 provider 的最小 TextDocument */
export class ExtHostTextDocument {
  constructor(
    readonly uri: ExtHostUri,
    private _text: string,
    readonly languageId: string
  ) {}
  getText(): string {
    return this._text
  }
  _setText(text: string): void {
    this._text = text
  }
  get lineCount(): number {
    return this._text.split('\n').length
  }
}

/**
 * ExtHostDocuments —— 扩展宿主侧的「打开文档」镜像（Phase 13.2）。
 * 渲染层（monaco model）把打开/变更/关闭单向推过来，这里维护文本副本，
 * 供语言特性 provider 读取（对应 VSCode 的 ExtHostDocuments/DocumentData）。
 */
export class ExtHostDocuments implements ExtHostDocumentsShape {
  private readonly _docs = new Map<string, ExtHostTextDocument>()

  $acceptModelOpened(uri: UriComponents, text: string, languageId: string): void {
    this._docs.set(key(uri), new ExtHostTextDocument(ExtHostUri.from(uri), text, languageId))
  }

  $acceptModelChanged(uri: UriComponents, text: string): void {
    const doc = this._docs.get(key(uri))
    if (doc) doc._setText(text)
    else this._docs.set(key(uri), new ExtHostTextDocument(ExtHostUri.from(uri), text, 'plaintext'))
  }

  $acceptModelClosed(uri: UriComponents): void {
    this._docs.delete(key(uri))
  }

  /** 供 provider 查询文档；不存在时返回一个空文档兜底 */
  getDocument(uri: UriComponents): ExtHostTextDocument {
    return this._docs.get(key(uri)) ?? new ExtHostTextDocument(ExtHostUri.from(uri), '', 'plaintext')
  }
}
