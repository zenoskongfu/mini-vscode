const vscode = require('vscode')

function activate(context) {
  console.log('[emoji-log] activate()')
  const d = vscode.commands.registerCommand('emoji-log.hello', () => {
    vscode.window.showInformationMessage('🎉 Hello from the Emoji Log extension! 🚀')
  })
  context.subscriptions.push(d)
}

function deactivate() {}

module.exports = { activate, deactivate }
