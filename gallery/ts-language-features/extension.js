// Phase 13.2+ 路线 A：用 TypeScript 语言服务做真·跨文件 go-to-definition。
// 扩展跑在 Node 扩展宿主里，有完整 fs，能读 tsconfig + node_modules + 全部文件，
// 这是 Monaco 沙箱 worker 做不到的。go-to-definition 的位置计算交给
// ts.LanguageService.getDefinitionAtPosition，不手写 AST。
const vscode = require('vscode')
const ts = require('typescript')
const fs = require('fs')
const path = require('path')

/** 字符偏移 → {line,character}(0-based) */
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

/** 从某目录向上找最近含 tsconfig.json 的目录 */
function findTsconfigDir(dir) {
  let cur = dir
  for (let i = 0; i < 40; i++) {
    if (fs.existsSync(path.join(cur, 'tsconfig.json'))) return cur
    const parent = path.dirname(cur)
    if (parent === cur) break
    cur = parent
  }
  return null
}

function activate(context) {
  console.log('[ts-language-features] activate()')

  let service = null
  let serviceRoot = null

  const openDoc = fileName =>
    vscode.workspace.textDocuments.find(d => d.uri.path === fileName) || null

  function compilerOptions(rootDir) {
    const cfgPath = ts.findConfigFile(rootDir, ts.sys.fileExists, 'tsconfig.json')
    if (cfgPath) {
      const read = ts.readConfigFile(cfgPath, ts.sys.readFile)
      const parsed = ts.parseJsonConfigFileContent(read.config || {}, ts.sys, path.dirname(cfgPath))
      return parsed.options
    }
    return {
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
      jsx: ts.JsxEmit.React,
      allowJs: true,
      esModuleInterop: true,
      allowNonTsExtensions: true
    }
  }

  /** 复用单个 LanguageService（按工作区根缓存） */
  function ensureService(rootDir) {
    if (service && serviceRoot === rootDir) return service
    serviceRoot = rootDir
    const options = compilerOptions(rootDir)
    const host = {
      // 打开的 .ts/.tsx 文件作入口；import 链由 LS 经 fileExists/readFile 自动拉
      getScriptFileNames: () =>
        vscode.workspace.textDocuments
          .filter(d => /\.(ts|tsx|js|jsx)$/.test(d.uri.path))
          .map(d => d.uri.path),
      getScriptVersion: f => {
        const d = openDoc(f)
        if (d) return 'open-' + d.version
        try {
          return 'disk-' + fs.statSync(f).mtimeMs
        } catch {
          return '0'
        }
      },
      getScriptSnapshot: f => {
        const d = openDoc(f)
        let text
        if (d) text = d.getText()
        else {
          try {
            text = fs.readFileSync(f, 'utf8')
          } catch {
            return undefined
          }
        }
        return ts.ScriptSnapshot.fromString(text)
      },
      getCurrentDirectory: () => rootDir,
      getCompilationSettings: () => options,
      getDefaultLibFileName: o => ts.getDefaultLibFilePath(o),
      fileExists: ts.sys.fileExists,
      readFile: ts.sys.readFile,
      readDirectory: ts.sys.readDirectory,
      directoryExists: ts.sys.directoryExists,
      getDirectories: ts.sys.getDirectories
    }
    service = ts.createLanguageService(host, ts.createDocumentRegistry())
    return service
  }

  const provider = {
    provideDefinition(document, position) {
      const fileName = document.uri.path
      const rootDir = findTsconfigDir(path.dirname(fileName)) || path.dirname(fileName)
      const ls = ensureService(rootDir)
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
        const d = openDoc(def.fileName)
        let text = ''
        if (d) text = d.getText()
        else {
          try {
            text = fs.readFileSync(def.fileName, 'utf8')
          } catch {
            text = ''
          }
        }
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

  // ── 诊断（Phase 13.3）：用同一个 LanguageService 产生真·TS 诊断 ──
  const diagnostics = vscode.languages.createDiagnosticCollection('ts')
  context.subscriptions.push(diagnostics)

  function refresh(doc) {
    const fileName = doc.uri.path
    if (!/\.(ts|tsx)$/.test(fileName)) return
    const rootDir = findTsconfigDir(path.dirname(fileName)) || path.dirname(fileName)
    const ls = ensureService(rootDir)
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
          tsCategoryToSeverity(d.category)
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

  // 激活时先算一遍所有打开的 ts 文档；之后随打开/编辑/关闭增量更新
  for (const doc of vscode.workspace.textDocuments) refresh(doc)
  context.subscriptions.push(vscode.workspace.onDidOpenTextDocument(doc => refresh(doc)))
  context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(e => scheduleRefresh(e.document)))
  context.subscriptions.push(vscode.workspace.onDidCloseTextDocument(doc => diagnostics.delete(doc.uri)))
}

/** ts.DiagnosticCategory(Warning=0,Error=1,Suggestion=2,Message=3) → vscode.DiagnosticSeverity */
function tsCategoryToSeverity(cat) {
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

function deactivate() {}

module.exports = { activate, deactivate }
