// TypeScript language features run in the Node extension host, where they can
// read tsconfig, node_modules, and imported files through the real filesystem.
const ts = require('typescript')
const fs = require('fs')
const path = require('path')

function createLanguageServiceManager(workspace) {
  let service = null
  let serviceRoot = null

  const openDoc = fileName =>
    workspace.textDocuments.find(d => d.uri.path === fileName) || null

  function ensureService(rootDir) {
    if (service && serviceRoot === rootDir) return service
    serviceRoot = rootDir
    const options = compilerOptions(rootDir)
    const host = {
      // Open documents are the LS entry points; imports are pulled through
      // fileExists/readFile/readDirectory by TypeScript itself.
      getScriptFileNames: () =>
        workspace.textDocuments
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
        const text = readFileText(f, openDoc)
        if (text === null) return undefined
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

  function serviceForFile(fileName) {
    const rootDir = findTsconfigDir(path.dirname(fileName)) || path.dirname(fileName)
    return ensureService(rootDir)
  }

  return {
    openDoc,
    readFileText: fileName => readFileText(fileName, openDoc),
    serviceForFile
  }
}

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

function readFileText(fileName, openDoc) {
  const doc = openDoc(fileName)
  if (doc) return doc.getText()
  try {
    return fs.readFileSync(fileName, 'utf8')
  } catch {
    return null
  }
}

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

module.exports = { createLanguageServiceManager, findTsconfigDir }
