import { ipcMain, dialog } from 'electron'
import { WindowManager } from './window-manager'
import { FileSystemService } from './services/file-system-service'
import { TerminalService } from './services/terminal-service'

export const IPC_CHANNELS = {
  FS_READ_DIR: 'fs:readDir',
  FS_READ_FILE: 'fs:readFile',
  FS_WRITE_FILE: 'fs:writeFile',
  FS_CREATE_FILE: 'fs:createFile',
  FS_CREATE_DIR: 'fs:createDir',
  FS_RENAME: 'fs:rename',
  FS_DELETE: 'fs:delete',
  FS_WATCH_START: 'fs:watch:start',
  FS_WATCH_STOP: 'fs:watch:stop',
  TERMINAL_CREATE: 'terminal:create',
  TERMINAL_INPUT: 'terminal:input',
  TERMINAL_RESIZE: 'terminal:resize',
  TERMINAL_KILL: 'terminal:kill',
  GIT_STATUS: 'git:status',
  GIT_DIFF: 'git:diff',
  GIT_STAGE: 'git:stage',
  GIT_UNSTAGE: 'git:unstage',
  GIT_COMMIT: 'git:commit',
  GIT_BRANCH: 'git:branch',
  SEARCH_FIND: 'search:find',
  SEARCH_CANCEL: 'search:cancel',
  CONFIG_GET: 'config:get',
  CONFIG_SET: 'config:set',
  DIALOG_OPEN_FOLDER: 'dialog:openFolder',
  DIALOG_OPEN_FILE: 'dialog:openFile',
  DIALOG_SHOW_MESSAGE: 'dialog:showMessage',
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_MAXIMIZE: 'window:maximize',
  WINDOW_CLOSE: 'window:close',
  WINDOW_IS_MAXIMIZED: 'window:isMaximized'
} as const

export class IPCRouter {
  private fsService = new FileSystemService()
  private terminalService = new TerminalService()

  constructor(private windowManager: WindowManager) {}

  register(): void {
    this.registerWindowHandlers()
    this.registerFSHandlers()
    this.registerDialogHandlers()
    this.registerTerminalHandlers()
  }

  private registerTerminalHandlers(): void {
    ipcMain.handle(IPC_CHANNELS.TERMINAL_CREATE, (_e, id: string, cwd: string) => {
      const win = this.windowManager.getMainWindow()
      if (win) this.terminalService.create(id, cwd, win)
    })
    ipcMain.handle(IPC_CHANNELS.TERMINAL_INPUT, (_e, id: string, data: string) => {
      this.terminalService.write(id, data)
    })
    ipcMain.handle(IPC_CHANNELS.TERMINAL_RESIZE, (_e, id: string, cols: number, rows: number) => {
      this.terminalService.resize(id, cols, rows)
    })
    ipcMain.handle(IPC_CHANNELS.TERMINAL_KILL, (_e, id: string) => {
      this.terminalService.kill(id)
    })
  }

  private registerWindowHandlers(): void {
    ipcMain.handle(IPC_CHANNELS.WINDOW_MINIMIZE, () => {
      this.windowManager.getMainWindow()?.minimize()
    })
    ipcMain.handle(IPC_CHANNELS.WINDOW_MAXIMIZE, () => {
      const win = this.windowManager.getMainWindow()
      if (!win) return
      win.isMaximized() ? win.unmaximize() : win.maximize()
    })
    ipcMain.handle(IPC_CHANNELS.WINDOW_CLOSE, () => {
      this.windowManager.getMainWindow()?.close()
    })
    ipcMain.handle(IPC_CHANNELS.WINDOW_IS_MAXIMIZED, () => {
      return this.windowManager.getMainWindow()?.isMaximized() ?? false
    })
  }

  private registerFSHandlers(): void {
    ipcMain.handle(IPC_CHANNELS.FS_READ_DIR, (_e, dirPath: string) =>
      this.fsService.readDir(dirPath)
    )
    ipcMain.handle(IPC_CHANNELS.FS_READ_FILE, (_e, filePath: string) =>
      this.fsService.readFile(filePath)
    )
    ipcMain.handle(IPC_CHANNELS.FS_WRITE_FILE, (_e, filePath: string, content: string) =>
      this.fsService.writeFile(filePath, content)
    )
    ipcMain.handle(IPC_CHANNELS.FS_CREATE_FILE, (_e, filePath: string) =>
      this.fsService.createFile(filePath)
    )
    ipcMain.handle(IPC_CHANNELS.FS_CREATE_DIR, (_e, dirPath: string) =>
      this.fsService.createDir(dirPath)
    )
    ipcMain.handle(IPC_CHANNELS.FS_RENAME, (_e, oldPath: string, newPath: string) =>
      this.fsService.rename(oldPath, newPath)
    )
    ipcMain.handle(IPC_CHANNELS.FS_DELETE, (_e, targetPath: string) =>
      this.fsService.delete(targetPath)
    )
    ipcMain.handle(IPC_CHANNELS.FS_WATCH_START, (_e, rootPath: string) => {
      const win = this.windowManager.getMainWindow()
      if (win) this.fsService.watchStart(rootPath, win)
    })
    ipcMain.handle(IPC_CHANNELS.FS_WATCH_STOP, (_e, rootPath: string) =>
      this.fsService.watchStop(rootPath)
    )
  }

  private registerDialogHandlers(): void {
    ipcMain.handle(IPC_CHANNELS.DIALOG_OPEN_FOLDER, async () => {
      const win = this.windowManager.getMainWindow()
      const result = await dialog.showOpenDialog(win!, {
        properties: ['openDirectory']
      })
      return result.canceled ? null : result.filePaths[0]
    })

    ipcMain.handle(IPC_CHANNELS.DIALOG_OPEN_FILE, async () => {
      const win = this.windowManager.getMainWindow()
      const result = await dialog.showOpenDialog(win!, {
        properties: ['openFile']
      })
      return result.canceled ? null : result.filePaths[0]
    })

    ipcMain.handle(IPC_CHANNELS.DIALOG_SHOW_MESSAGE, async (_e, options: Electron.MessageBoxOptions) => {
      const win = this.windowManager.getMainWindow()
      const result = await dialog.showMessageBox(win!, options)
      return result.response
    })
  }
}
