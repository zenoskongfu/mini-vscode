const path = require('path')
const fs = require('fs')

// 路径 ↔ file:// uri（最小实现）
function pathToUri(p) {
  return 'file://' + p
}

function uriToPath(u) {
  try {
    return decodeURIComponent(u.replace(/^file:\/\//, ''))
  } catch {
    return u.replace(/^file:\/\//, '')
  }
}

// LSP severity(1=Error,2=Warning,3=Info,4=Hint) → vscode(0,1,2,3)
function lspSeverityToVscode(s) {
  return s === 1 ? 0 : s === 2 ? 1 : s === 3 ? 2 : 3
}

function isTs(doc) {
  return doc && /\.(ts|tsx)$/.test(doc.uri.path)
}

function findRoot(file) {
  let cur = path.dirname(file)
  for (let i = 0; i < 40; i++) {
    if (fs.existsSync(path.join(cur, 'tsconfig.json'))) return cur
    const parent = path.dirname(cur)
    if (parent === cur) break
    cur = parent
  }
  return path.dirname(file)
}

module.exports = {
  pathToUri,
  uriToPath,
  lspSeverityToVscode,
  isTs,
  findRoot
}
