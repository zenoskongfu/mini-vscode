/** mini JSON-RPC over stdio（LSP 分帧） */
function createConnection(child, onNotification, onServerRequest) {
  let buffer = Buffer.alloc(0)
  let contentLength = -1
  const pending = new Map()
  let nextId = 1

  function send(obj) {
    const json = JSON.stringify(obj)
    child.stdin.write('Content-Length: ' + Buffer.byteLength(json, 'utf8') + '\r\n\r\n' + json)
  }

  function dispatch(msg) {
    if (msg.id !== undefined && msg.method !== undefined) {
      // 服务器 → 客户端 请求：必须回应，否则服务器可能卡住
      Promise.resolve(onServerRequest(msg.method, msg.params)).then(result =>
        send({ jsonrpc: '2.0', id: msg.id, result: result === undefined ? null : result })
      )
    } else if (msg.id !== undefined) {
      const p = pending.get(msg.id)
      pending.delete(msg.id)
      if (p) {
        if (msg.error) p.reject(new Error(msg.error.message || 'LSP error'))
        else p.resolve(msg.result)
      }
    } else if (msg.method) {
      onNotification(msg.method, msg.params)
    }
  }

  child.stdout.on('data', chunk => {
    buffer = Buffer.concat([buffer, chunk])
    for (;;) {
      if (contentLength < 0) {
        const headerEnd = buffer.indexOf('\r\n\r\n')
        if (headerEnd < 0) break
        const header = buffer.slice(0, headerEnd).toString('ascii')
        const m = /Content-Length:\s*(\d+)/i.exec(header)
        contentLength = m ? parseInt(m[1], 10) : 0
        buffer = buffer.slice(headerEnd + 4)
      }
      if (buffer.length < contentLength) break
      const body = buffer.slice(0, contentLength).toString('utf8')
      buffer = buffer.slice(contentLength)
      contentLength = -1
      let msg
      try {
        msg = JSON.parse(body)
      } catch {
        continue
      }
      dispatch(msg)
    }
  })

  return {
    request(method, params) {
      const id = nextId++
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject })
        send({ jsonrpc: '2.0', id, method, params })
      })
    },
    notify(method, params) {
      send({ jsonrpc: '2.0', method, params })
    }
  }
}

module.exports = { createConnection }
