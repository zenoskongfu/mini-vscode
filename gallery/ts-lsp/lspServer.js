const cp = require('child_process')
const path = require('path')
const { createConnection } = require('./lspProtocol')
const { pathToUri } = require('./lspUtils')

function createTypescriptLspServer(onNotification, onServerRequest) {
  let conn = null
  let starting = null

  function ensureConnection(rootPath) {
    if (conn) return Promise.resolve(conn)
    if (starting) return starting

    const cli = require.resolve('typescript-language-server/lib/cli.mjs')
    console.log('[ts-lsp] spawning server:', cli, 'root=', rootPath)
    const child = cp.spawn(process.execPath, [cli, '--stdio'], {
      // 让 Electron 二进制以 Node 模式运行子进程（VSCode 同款手法）
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      stdio: ['pipe', 'pipe', 'inherit']
    })

    child.on('exit', code => {
      console.log('[ts-lsp] server exited', code)
      conn = null
      starting = null
    })

    const c = createConnection(child, onNotification, onServerRequest)
    starting = c
      .request('initialize', {
        processId: process.pid,
        rootUri: pathToUri(rootPath),
        workspaceFolders: [{ uri: pathToUri(rootPath), name: path.basename(rootPath) }],
        capabilities: {
          textDocument: {
            synchronization: { dynamicRegistration: false },
            definition: {},
            publishDiagnostics: {}
          }
        }
      })
      .then(() => {
        c.notify('initialized', {})
        conn = c
        starting = null
        console.log('[ts-lsp] initialized')
        return c
      })

    return starting
  }

  return {
    ensureConnection,
    getConnection() {
      return conn
    }
  }
}

module.exports = { createTypescriptLspServer }
