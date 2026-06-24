// 一个最小的 mini-vscode 扩展（CommonJS，模拟真实 VSCode 扩展）。
// `require('vscode')` 会被扩展宿主拦截。
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
