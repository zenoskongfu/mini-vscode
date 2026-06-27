const ts = require('typescript')

function registerDiagnosticFeatures(context, vscode, manager) {
  const diagnostics = vscode.languages.createDiagnosticCollection('ts')
  context.subscriptions.push(diagnostics)

  function refresh(doc) {
    const fileName = doc.uri.path
    if (!/\.(ts|tsx)$/.test(fileName)) return
    const ls = manager.serviceForFile(fileName)
    let ds
    try {
      ds = ls.getSemanticDiagnostics(fileName).concat(ls.getSyntacticDiagnostics(fileName))
    } catch (e) {
      console.error('[ts-language-features] diagnostics failed', e)
      return
    }
    const out = []
    for (const d of ds) {
      if (!d.file || typeof d.start !== 'number') continue
      const s = ts.getLineAndCharacterOfPosition(d.file, d.start)
      const e = ts.getLineAndCharacterOfPosition(d.file, d.start + (d.length || 0))
      out.push(
        new vscode.Diagnostic(
          new vscode.Range(s.line, s.character, e.line, e.character),
          ts.flattenDiagnosticMessageText(d.messageText, '\n'),
          tsCategoryToSeverity(vscode, d.category)
        )
      )
    }
    diagnostics.set(doc.uri, out)
    console.log(`[ts-language-features] diagnostics ${fileName} → ${out.length} 条`)
  }

  const timers = new Map()
  function scheduleRefresh(doc) {
    const k = doc.uri.path
    clearTimeout(timers.get(k))
    timers.set(
      k,
      setTimeout(() => {
        timers.delete(k)
        refresh(doc)
      }, 300)
    )
  }

  for (const doc of vscode.workspace.textDocuments) refresh(doc)
  context.subscriptions.push(vscode.workspace.onDidOpenTextDocument(doc => refresh(doc)))
  context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(e => scheduleRefresh(e.document)))
  context.subscriptions.push(vscode.workspace.onDidCloseTextDocument(doc => diagnostics.delete(doc.uri)))
}

function tsCategoryToSeverity(vscode, cat) {
  switch (cat) {
    case ts.DiagnosticCategory.Error:
      return vscode.DiagnosticSeverity.Error
    case ts.DiagnosticCategory.Warning:
      return vscode.DiagnosticSeverity.Warning
    case ts.DiagnosticCategory.Suggestion:
      return vscode.DiagnosticSeverity.Hint
    default:
      return vscode.DiagnosticSeverity.Information
  }
}

module.exports = { registerDiagnosticFeatures, tsCategoryToSeverity }
