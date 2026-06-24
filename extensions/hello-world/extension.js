// A minimal mini-vscode extension (CommonJS, like a real VSCode extension).
// `require('vscode')` is intercepted by the extension host.
const vscode = require('vscode')

function activate(context) {
  console.log('[hello-world] activate()')

  const disposable = vscode.commands.registerCommand('hello-world.helloWorld', () => {
    vscode.window.showInformationMessage('Hello World from the extension host! 👋')
  })

  context.subscriptions.push(disposable)
}

function deactivate() {}

module.exports = { activate, deactivate }
