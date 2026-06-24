/**
 * Captures the extension-host MessagePort as early as possible.
 *
 * The preload re-posts the transferred port into the main world via
 * `window.postMessage('exthost:port', '*', [port])`. This module installs the
 * listener at import time (imported first in index.tsx) so the port is never
 * missed, and exposes it as a promise for the ExtensionService to await.
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
