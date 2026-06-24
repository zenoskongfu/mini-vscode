/**
 * 尽可能早地捕获扩展宿主 MessagePort。
 *
 * preload 会通过 `window.postMessage('exthost:port', '*', [port])`
 * 把转移过来的端口重新投递到主世界。本模块在导入时安装 listener
 *（index.tsx 会最先导入它），避免错过端口，并以 Promise 形式暴露给 ExtensionService 等待。
 */
let resolvePort: (port: MessagePort) => void
export const extHostPortPromise = new Promise<MessagePort>(resolve => {
  resolvePort = resolve
})

if (typeof window !== 'undefined') {
  window.addEventListener('message', event => {
    if (event.data === 'exthost:port' && event.ports[0]) {
      resolvePort(event.ports[0])
    }
  })
}
