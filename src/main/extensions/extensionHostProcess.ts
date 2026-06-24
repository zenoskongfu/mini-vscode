import { utilityProcess, MessageChannelMain, app, type BrowserWindow, type UtilityProcess } from 'electron'
import path from 'path'

/**
 * Spawns the Extension Host (a Node utilityProcess) and brokers a MessagePort
 * pair so the ext host and the renderer talk directly:
 *
 *   ExtHost (utilityProcess) ←─ MessageChannel ─→ Renderer
 *                       main only hands off the two ports
 *
 * This mirrors VSCode's desktop architecture (ext host ↔ renderer over a port).
 */
export class ExtensionHost {
  private child: UtilityProcess | null = null

  start(mainWindow: BrowserWindow): void {
    // Built alongside the main process by electron-vite (see vite config input)
    const entry = path.join(__dirname, 'extensionHost.js')

    // Builtin extensions live at <appRoot>/extensions (dev: project root)
    const extensionsDir = path.join(app.getAppPath(), 'extensions')

    this.child = utilityProcess.fork(entry, [], {
      stdio: 'inherit', // surface ExtHost console.* in the main terminal
      serviceName: 'mini-vscode-extension-host'
    })

    const { port1, port2 } = new MessageChannelMain()

    this.child.on('spawn', () => {
      // Give the ext host one end + the init payload
      this.child!.postMessage({ extensionsDir }, [port1])
      // Give the renderer the other end (once its web contents are ready)
      const send = (): void => {
        if (!mainWindow.isDestroyed()) {
          mainWindow.webContents.postMessage('exthost:port', null, [port2])
        }
      }
      if (mainWindow.webContents.isLoading()) {
        mainWindow.webContents.once('did-finish-load', send)
      } else {
        send()
      }
    })

    this.child.on('exit', code => {
      console.log('[main] extension host exited', code)
      this.child = null
    })
  }

  dispose(): void {
    this.child?.kill()
    this.child = null
  }
}
