import { contextBridge, ipcRenderer } from 'electron'

/**
 * contextBridge exposes a typed API to the renderer process.
 * The renderer NEVER calls ipcRenderer directly — it always goes through window.electronAPI.
 * This is the security boundary between the privileged main process and the web content.
 */
contextBridge.exposeInMainWorld('electronAPI', {
  // Window controls (used by custom TitleBar on non-macOS)
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
    onMaximizeChange: (cb: (maximized: boolean) => void) => {
      ipcRenderer.on('window:maximizeChange', (_, v) => cb(v))
      return () => ipcRenderer.removeAllListeners('window:maximizeChange')
    }
  },

  // File System — Phase 2
  fs: {
    readDir: (path: string) => ipcRenderer.invoke('fs:readDir', path),
    readFile: (path: string) => ipcRenderer.invoke('fs:readFile', path),
    writeFile: (path: string, content: string) =>
      ipcRenderer.invoke('fs:writeFile', path, content),
    createFile: (path: string) => ipcRenderer.invoke('fs:createFile', path),
    createDir: (path: string) => ipcRenderer.invoke('fs:createDir', path),
    rename: (oldPath: string, newPath: string) =>
      ipcRenderer.invoke('fs:rename', oldPath, newPath),
    delete: (path: string) => ipcRenderer.invoke('fs:delete', path),
    watchStart: (path: string) => ipcRenderer.invoke('fs:watch:start', path),
    watchStop: (path: string) => ipcRenderer.invoke('fs:watch:stop', path),
    onChange: (cb: (event: unknown) => void) => {
      ipcRenderer.on('fs:onChange', (_, e) => cb(e))
      return () => ipcRenderer.removeAllListeners('fs:onChange')
    }
  },

  // Terminal — Phase 5
  terminal: {
    create: (id: string, cwd: string) =>
      ipcRenderer.invoke('terminal:create', id, cwd),
    input: (id: string, data: string) =>
      ipcRenderer.invoke('terminal:input', id, data),
    resize: (id: string, cols: number, rows: number) =>
      ipcRenderer.invoke('terminal:resize', id, cols, rows),
    kill: (id: string) => ipcRenderer.invoke('terminal:kill', id),
    onData: (cb: (id: string, data: string) => void) => {
      const listener = (_: unknown, id: string, data: string): void => cb(id, data)
      ipcRenderer.on('terminal:data', listener as never)
      return () => ipcRenderer.removeListener('terminal:data', listener as never)
    },
    onExit: (cb: (id: string, exitCode: number) => void) => {
      const listener = (_: unknown, id: string, code: number): void => cb(id, code)
      ipcRenderer.on('terminal:exit', listener as never)
      return () => ipcRenderer.removeListener('terminal:exit', listener as never)
    }
  },

  // Git — Phase 8
  git: {
    status: (cwd: string) => ipcRenderer.invoke('git:status', cwd),
    diff: (cwd: string, file: string) =>
      ipcRenderer.invoke('git:diff', cwd, file),
    stage: (cwd: string, file: string) =>
      ipcRenderer.invoke('git:stage', cwd, file),
    unstage: (cwd: string, file: string) =>
      ipcRenderer.invoke('git:unstage', cwd, file),
    commit: (cwd: string, message: string) =>
      ipcRenderer.invoke('git:commit', cwd, message),
    branch: (cwd: string) => ipcRenderer.invoke('git:branch', cwd)
  },

  // Search — Phase 7
  search: {
    find: (root: string, query: string, options: unknown) =>
      ipcRenderer.invoke('search:find', root, query, options),
    cancel: () => ipcRenderer.invoke('search:cancel')
  },

  // Config — Phase 6
  config: {
    get: () => ipcRenderer.invoke('config:get'),
    set: (partial: unknown) => ipcRenderer.invoke('config:set', partial),
    getPath: () => ipcRenderer.invoke('config:getPath'),
    onChange: (cb: (settings: unknown) => void) => {
      const listener = (_: unknown, s: unknown): void => cb(s)
      ipcRenderer.on('config:onChange', listener as never)
      return () => ipcRenderer.removeListener('config:onChange', listener as never)
    }
  },

  // Dialogs
  dialog: {
    openFolder: () => ipcRenderer.invoke('dialog:openFolder'),
    openFile: () => ipcRenderer.invoke('dialog:openFile'),
    showMessage: (options: unknown) =>
      ipcRenderer.invoke('dialog:showMessage', options)
  }
})
