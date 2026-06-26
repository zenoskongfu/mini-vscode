const vscode = require('vscode')

function activate(context) {
  console.log('[word-count] activate()')
  const d = vscode.commands.registerCommand('word-count.count', () => {
    const n = 1000 + Math.floor(Math.random() * 9000)
    vscode.window.showInformationMessage(`This document has ${n.toLocaleString()} words (mock).`)
  })
  context.subscriptions.push(d)
}

function deactivate() {}

module.exports = { activate, deactivate }
