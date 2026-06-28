// Phase 13.4 —— VSCode 忠实路线：扩展只当「薄 LSP 客户端」，真正干活的是独立的
// typescript-language-server 子进程（LSP over stdio）。本扩展自带一个 mini LSP 客户端
// （JSON-RPC + Content-Length 分帧），spawn 服务器、握手、转发文档、把 LSP 的
// definition / publishDiagnostics 适配成 vscode provider（再经 13.2/13.3 的桥接到 monaco）。
const vscode = require('vscode')
const { createTypescriptLspServer } = require('./lspServer')
const {
  pathToUri,
  uriToPath,
  lspSeverityToVscode,
  isTs,
  findRoot
} = require('./lspUtils')

function activate(context) {
  console.log('[ts-lsp] activate()')

  const versions = new Map() // path → 文档版本号
  const diagnostics = vscode.languages.createDiagnosticCollection('ts-lsp')
  context.subscriptions.push(diagnostics)
  const server = createTypescriptLspServer(onNotification, onServerRequest)

  function onNotification(method, params) {
    if (method === 'textDocument/publishDiagnostics') {
      const p = uriToPath(params.uri)
      const diags = (params.diagnostics || []).map(d => {
        const r = d.range
        const diag = new vscode.Diagnostic(
          new vscode.Range(r.start.line, r.start.character, r.end.line, r.end.character),
          d.message,
          lspSeverityToVscode(d.severity)
        )
        if (d.source) diag.source = d.source
        return diag
      })
      diagnostics.set({ scheme: 'file', path: p }, diags)
      console.log(`[ts-lsp] diagnostics ${p} → ${diags.length} 条`)
    }
  }
  function onServerRequest(method, params) {
    // 服务器配置/能力注册等请求：给个无害回应即可
    if (method === 'workspace/configuration') return (params.items || []).map(() => ({}))
    return null
  }

  async function didOpen(doc) {
    const c = await server.ensureConnection(findRoot(doc.uri.path))
    versions.set(doc.uri.path, 1)
    c.notify('textDocument/didOpen', {
      textDocument: {
        uri: pathToUri(doc.uri.path),
        languageId: doc.languageId || 'typescript',
        version: 1,
        text: doc.getText()
      }
    })
  }
  function didChange(doc) {
    const conn = server.getConnection()
    if (!conn) return
    const v = (versions.get(doc.uri.path) || 1) + 1
    versions.set(doc.uri.path, v)
    conn.notify('textDocument/didChange', {
      textDocument: { uri: pathToUri(doc.uri.path), version: v },
      contentChanges: [{ text: doc.getText() }] // 全量同步
    })
  }
  function didClose(doc) {
    const conn = server.getConnection()
    if (conn) conn.notify('textDocument/didClose', { textDocument: { uri: pathToUri(doc.uri.path) } })
    diagnostics.delete({ scheme: 'file', path: doc.uri.path })
  }

  // definition provider（textDocument/definition → vscode.Location）
  context.subscriptions.push(
    vscode.languages.registerDefinitionProvider(['typescript', 'typescriptreact'], {
      async provideDefinition(document, position) {
        const c = server.getConnection() || (await server.ensureConnection(findRoot(document.uri.path)))
        const res = await c.request('textDocument/definition', {
          textDocument: { uri: pathToUri(document.uri.path) },
          position: { line: position.line, character: position.character }
        })
        const locs = Array.isArray(res) ? res : res ? [res] : []
        return locs.map(l => {
          const r = l.range
          return new vscode.Location(
            vscode.Uri.file(uriToPath(l.uri)),
            new vscode.Range(r.start.line, r.start.character, r.end.line, r.end.character)
          )
        })
      }
    })
  )

  // 文档生命周期 → LSP 通知
  for (const doc of vscode.workspace.textDocuments) if (isTs(doc)) didOpen(doc)
  context.subscriptions.push(vscode.workspace.onDidOpenTextDocument(doc => { if (isTs(doc)) didOpen(doc) }))
  context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(e => { if (isTs(e.document)) didChange(e.document) }))
  context.subscriptions.push(vscode.workspace.onDidCloseTextDocument(doc => { if (isTs(doc)) didClose(doc) }))
}

function deactivate() {}

module.exports = { activate, deactivate }
