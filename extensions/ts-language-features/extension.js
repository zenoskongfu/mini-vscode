const vscode = require('vscode')

const { createLanguageServiceManager } = require('./languageService')
const { registerDefinitionFeatures } = require('./definitionProvider')
const { registerDiagnosticFeatures } = require('./diagnostics')

function activate(context) {
  console.log('[ts-language-features] activate()')

  const manager = createLanguageServiceManager(vscode.workspace)

  registerDefinitionFeatures(context, vscode, manager)
  registerDiagnosticFeatures(context, vscode, manager)
}

function deactivate() {}

module.exports = { activate, deactivate }
