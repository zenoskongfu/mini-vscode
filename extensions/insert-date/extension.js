const vscode = require('vscode')

function activate(context) {
  console.log('[insert-date] activate()')
  const d = vscode.commands.registerCommand('insert-date.now', () => {
    vscode.window.showInformationMessage(`Current date: ${new Date().toLocaleString()}`)
  })
  context.subscriptions.push(d)
}

function deactivate() {}

module.exports = { activate, deactivate }
