import { contextBridge, ipcRenderer } from 'electron'

/**
 * contextBridge 向 renderer 进程暴露带类型的 API。
 * renderer 绝不直接调用 ipcRenderer，而是始终通过 window.electronAPI。
 * 这是有权限 main 进程与网页内容之间的安全边界。
 */
contextBridge.exposeInMainWorld('electronAPI', {
  // 窗口控制（供非 macOS 的自定义 TitleBar 使用）
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

  // 文件系统 — Phase 2
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

  // 终端 — Phase 5
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

  // 搜索 — Phase 7
  search: {
    find: (root: string, query: string, options: unknown) =>
      ipcRenderer.invoke('search:find', root, query, options),
    cancel: () => ipcRenderer.invoke('search:cancel')
  },

  // 配置 — Phase 6
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

  // 应用状态（主进程 state.json，抗强杀持久化）
  state: {
    get: () => ipcRenderer.invoke('state:get'),
    set: (partial: unknown) => ipcRenderer.invoke('state:set', partial)
  },

  // 调试 — Phase 14（DAP 客户端在主进程，事件单向推）
  debug: {
    start: (config: unknown, breakpoints: unknown) =>
      ipcRenderer.invoke('debug:start', config, breakpoints),
    request: (command: string, args: unknown) => ipcRenderer.invoke('debug:request', command, args),
    setBreakpoints: (path: string, lines: number[]) =>
      ipcRenderer.invoke('debug:setBreakpoints', path, lines),
    stop: () => ipcRenderer.invoke('debug:stop'),
    onEvent: (cb: (e: { event: string; body: unknown }) => void) => {
      const listener = (_: unknown, e: { event: string; body: unknown }): void => cb(e)
      ipcRenderer.on('debug:event', listener as never)
      return () => ipcRenderer.removeListener('debug:event', listener as never)
    }
  },

  // 对话框
  dialog: {
    openFolder: () => ipcRenderer.invoke('dialog:openFolder'),
    openFile: () => ipcRenderer.invoke('dialog:openFile'),
    showMessage: (options: unknown) =>
      ipcRenderer.invoke('dialog:showMessage', options)
  },

  // 扩展管理（从 gallery 安装/卸载）— Phase 6.6
  extensions: {
    listGallery: () => ipcRenderer.invoke('ext:listGallery'),
    install: (id: string) => ipcRenderer.invoke('ext:install', id),
    uninstall: (id: string) => ipcRenderer.invoke('ext:uninstall', id)
  }
})

/**
 * 扩展宿主端口交接。
 * main 会通过 webContents.postMessage 把 ext-host MessageChannel 的 renderer 端发送过来，
 * 到这里时端口位于 `event.ports`。MessagePort 不能直接穿过 contextBridge，
 * 因此需要再 post 到主世界；renderer 会监听 `window.onmessage`，
 * 并识别 data === 'exthost:port' 的消息。
 */
ipcRenderer.on('exthost:port', e => {
  window.postMessage('exthost:port', '*', e.ports)
})
