import { utilityProcess, MessageChannelMain, app, type BrowserWindow, type UtilityProcess } from 'electron'
import path from 'path'

/**
 * 启动扩展宿主（Node utilityProcess），并转交一对 MessagePort，
 * 让扩展宿主与 renderer 直接通信：
 *
 *   ExtHost（utilityProcess）←─ MessageChannel ─→ Renderer
 *                         main 只负责交接两个端口
 *
 * 这对应 VSCode 桌面端架构：扩展宿主与 renderer 通过端口通信。
 */
export class ExtensionHost {
  private child: UtilityProcess | null = null

  start(mainWindow: BrowserWindow): void {
    // 由 electron-vite 随 main 进程一起构建（见 vite 配置入口）
    const entry = path.join(__dirname, 'extensionHost.js')

    // 内置扩展位于 <appRoot>/extensions（开发态为项目根目录）
    const extensionsDir = path.join(app.getAppPath(), 'extensions')

    this.child = utilityProcess.fork(entry, [], {
      stdio: 'inherit', // 将 ExtHost 的 console.* 输出到 main 终端
      serviceName: 'mini-vscode-extension-host'
    })

    const { port1, port2 } = new MessageChannelMain()

    this.child.on('spawn', () => {
      // 把其中一个端口和初始化载荷交给扩展宿主
      this.child!.postMessage({ extensionsDir }, [port1])
      // 在 renderer webContents 就绪后，把另一个端口交给 renderer
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
