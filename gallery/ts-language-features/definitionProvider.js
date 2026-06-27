function registerDefinitionFeatures(context, vscode, manager) {
  const provider = {
    provideDefinition(document, position) {
      const fileName = document.uri.path
      const ls = manager.serviceForFile(fileName)
      const offset = document.offsetAt(position)

      let defs
      try {
        defs = ls.getDefinitionAtPosition(fileName, offset)
      } catch (e) {
        console.error('[ts-language-features] getDefinitionAtPosition failed', e)
        return []
      }
      if (!defs || defs.length === 0) {
        console.log(`[ts-language-features] ${fileName}@${offset} → 无定义`)
        return []
      }

      const out = []
      for (const def of defs) {
        const text = manager.readFileText(def.fileName) || ''
        const start = posAt(text, def.textSpan.start)
        const end = posAt(text, def.textSpan.start + def.textSpan.length)
        out.push(
          new vscode.Location(
            vscode.Uri.file(def.fileName),
            new vscode.Range(start.line, start.character, end.line, end.character)
          )
        )
      }
      console.log(`[ts-language-features] ${fileName}@${offset} → ${out.length} 个定义`)
      return out
    }
  }

  context.subscriptions.push(
    vscode.languages.registerDefinitionProvider(['typescript', 'typescriptreact'], provider)
  )
}

function posAt(text, offset) {
  let line = 0
  let lineStart = 0
  const n = Math.min(offset, text.length)
  for (let i = 0; i < n; i++) {
    if (text[i] === '\n') {
      line++
      lineStart = i + 1
    }
  }
  return { line, character: Math.max(0, offset - lineStart) }
}

module.exports = { registerDefinitionFeatures, posAt }
