import { ipcMain } from 'electron'
import { WindowManager } from './window-manager'

/**
 * IPC channel name constants — must stay in sync with src/preload/index.ts
 * and src/renderer/types/ipc-channels.ts
 *
 * Naming convention: domain:action
 */
export const IPC_CHANNELS = {
  // File System
  FS_READ_DIR: 'fs:readDir',
  FS_READ_FILE: 'fs:readFile',
  FS_WRITE_FILE: 'fs:writeFile',
  FS_CREATE_FILE: 'fs:createFile',
  FS_CREATE_DIR: 'fs:createDir',
  FS_RENAME: 'fs:rename',
  FS_DELETE: 'fs:delete',
  FS_WATCH_START: 'fs:watch:start',
  FS_WATCH_STOP: 'fs:watch:stop',
  // Terminal
  TERMINAL_CREATE: 'terminal:create',
  TERMINAL_INPUT: 'terminal:input',
  TERMINAL_RESIZE: 'terminal:resize',
  TERMINAL_KILL: 'terminal:kill',
  // Git
  GIT_STATUS: 'git:status',
  GIT_DIFF: 'git:diff',
  GIT_STAGE: 'git:stage',
  GIT_UNSTAGE: 'git:unstage',
  GIT_COMMIT: 'git:commit',
  GIT_BRANCH: 'git:branch',
  // Search
  SEARCH_FIND: 'search:find',
  SEARCH_CANCEL: 'search:cancel',
  // Config
  CONFIG_GET: 'config:get',
  CONFIG_SET: 'config:set',
  // Dialog
  DIALOG_OPEN_FOLDER: 'dialog:openFolder',
  DIALOG_OPEN_FILE: 'dialog:openFile',
  DIALOG_SHOW_MESSAGE: 'dialog:showMessage',
  // Window
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_MAXIMIZE: 'window:maximize',
  WINDOW_CLOSE: 'window:close',
  WINDOW_IS_MAXIMIZED: 'window:isMaximized'
} as const

export class IPCRouter {
  constructor(private windowManager: WindowManager) {}

  register(): void {
    this.registerWindowHandlers()
    // Future phases: register FS, Terminal, Git, Search, Config handlers here
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
}
