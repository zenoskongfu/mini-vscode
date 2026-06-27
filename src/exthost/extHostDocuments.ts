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
  /** 每次内容变化自增，供语言服务的 getScriptVersion 失效缓存 */
  version = 1

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
    this.version++
  }
  get lineCount(): number {
    return this._text.split('\n').length
  }

  /** {line,character}(0-based) → 字符偏移；TS 语言服务用偏移定位 */
  offsetAt(position: { line: number; character: number }): number {
    const lines = this._text.split('\n')
    let offset = 0
    for (let i = 0; i < position.line && i < lines.length; i++) {
      offset += lines[i].length + 1 // +1 为换行符
    }
    return offset + position.character
  }

  /** 字符偏移 → {line,character}(0-based) */
  positionAt(offset: number): { line: number; character: number } {
    const lines = this._text.split('\n')
    let remaining = offset
    let line = 0
    for (; line < lines.length; line++) {
      const lineLen = lines[line].length + 1
      if (remaining < lineLen) break
      remaining -= lineLen
    }
    return { line, character: Math.max(0, remaining) }
  }
}

/**
 * ExtHostDocuments —— 扩展宿主侧的「打开文档」镜像（Phase 13.2）。
 * 渲染层（monaco model）把打开/变更/关闭单向推过来，这里维护文本副本，
 * 供语言特性 provider 读取（对应 VSCode 的 ExtHostDocuments/DocumentData）。
 */
export class ExtHostDocuments implements ExtHostDocumentsShape {
  private readonly _docs = new Map<string, ExtHostTextDocument>()
  private readonly _changeListeners = new Set<(doc: ExtHostTextDocument) => void>()
  private readonly _openListeners = new Set<(doc: ExtHostTextDocument) => void>()
  private readonly _closeListeners = new Set<(doc: ExtHostTextDocument) => void>()

  $acceptModelOpened(uri: UriComponents, text: string, languageId: string): void {
    const doc = new ExtHostTextDocument(ExtHostUri.from(uri), text, languageId)
    this._docs.set(key(uri), doc)
    for (const cb of this._openListeners) cb(doc)
  }

  $acceptModelChanged(uri: UriComponents, text: string): void {
    let doc = this._docs.get(key(uri))
    if (doc) doc._setText(text)
    else {
      doc = new ExtHostTextDocument(ExtHostUri.from(uri), text, 'plaintext')
      this._docs.set(key(uri), doc)
    }
    for (const cb of this._changeListeners) cb(doc)
  }

  $acceptModelClosed(uri: UriComponents): void {
    const doc = this._docs.get(key(uri))
    this._docs.delete(key(uri))
    if (doc) for (const cb of this._closeListeners) cb(doc)
  }

  /** 供 provider 查询文档；不存在时返回一个空文档兜底 */
  getDocument(uri: UriComponents): ExtHostTextDocument {
    return this._docs.get(key(uri)) ?? new ExtHostTextDocument(ExtHostUri.from(uri), '', 'plaintext')
  }

  /** 当前所有打开的文档（供 vscode.workspace.textDocuments） */
  all(): ExtHostTextDocument[] {
    return [...this._docs.values()]
  }

  /** 文档内容变化订阅（供 vscode.workspace.onDidChangeTextDocument） */
  onDidChangeDocument(cb: (doc: ExtHostTextDocument) => void): { dispose(): void } {
    this._changeListeners.add(cb)
    return { dispose: () => this._changeListeners.delete(cb) }
  }

  /** 文档打开订阅（供 vscode.workspace.onDidOpenTextDocument） */
  onDidOpenDocument(cb: (doc: ExtHostTextDocument) => void): { dispose(): void } {
    this._openListeners.add(cb)
    return { dispose: () => this._openListeners.delete(cb) }
  }

  /** 文档关闭订阅（供 vscode.workspace.onDidCloseTextDocument） */
  onDidCloseDocument(cb: (doc: ExtHostTextDocument) => void): { dispose(): void } {
    this._closeListeners.add(cb)
    return { dispose: () => this._closeListeners.delete(cb) }
  }
}
