import { BrowserWindow, shell } from 'electron'
import { join } from 'path'

export class WindowManager {
  private mainWindow: BrowserWindow | null = null

  createMainWindow(): BrowserWindow {
    this.mainWindow = new BrowserWindow({
      width: 1280,
      height: 800,
      minWidth: 600,
      minHeight: 400,
      // 无边框窗口：标题栏由 renderer 自己绘制
      titleBarStyle: 'hidden',
      // macOS：把红黄绿窗口按钮放在正确位置
      trafficLightPosition: { x: 16, y: 10 },
      // macOS 保留原生标题栏，同时让内容覆盖到标题栏区域
      ...(process.platform !== 'darwin' && { frame: false }),
      backgroundColor: '#1e1e1e',
      show: false,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false
      }
    })

    // 窗口准备好后再显示，避免白屏闪烁
    this.mainWindow.on('ready-to-show', () => {
      this.mainWindow?.show()
    })

    // 外部链接交给系统默认浏览器打开
    this.mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      shell.openExternal(url)
      return { action: 'deny' }
    })

    // 加载 renderer 页面
    if (process.env.ELECTRON_RENDERER_URL) {
      this.mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
    } else {
      this.mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
    }

    this.mainWindow.on('closed', () => {
      this.mainWindow = null
    })

    return this.mainWindow
  }

  getMainWindow(): BrowserWindow | null {
    return this.mainWindow
  }
}
