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
      // Frameless window: we draw our own title bar in the renderer
      titleBarStyle: 'hidden',
      // macOS: show traffic light buttons at correct position
      trafficLightPosition: { x: 16, y: 10 },
      // Keep native title bar on macOS but overlay the content
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

    // Show window once ready to avoid white flash
    this.mainWindow.on('ready-to-show', () => {
      this.mainWindow?.show()
    })

    // Open external links in default browser
    this.mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      shell.openExternal(url)
      return { action: 'deny' }
    })

    // Load the renderer
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
