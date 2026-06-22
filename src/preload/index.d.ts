// Type declaration for window.electronAPI injected by preload script
// This file is referenced by tsconfig.web.json so the renderer gets full type safety.

export interface ElectronAPI {
  window: {
    minimize: () => Promise<void>
    maximize: () => Promise<void>
    close: () => Promise<void>
    isMaximized: () => Promise<boolean>
    onMaximizeChange: (cb: (maximized: boolean) => void) => () => void
  }
  fs: {
    readDir: (path: string) => Promise<unknown>
    readFile: (path: string) => Promise<string>
    writeFile: (path: string, content: string) => Promise<void>
    createFile: (path: string) => Promise<void>
    createDir: (path: string) => Promise<void>
    rename: (oldPath: string, newPath: string) => Promise<void>
    delete: (path: string) => Promise<void>
    watchStart: (path: string) => Promise<void>
    watchStop: (path: string) => Promise<void>
    onChange: (cb: (event: unknown) => void) => () => void
  }
  terminal: {
    create: (id: string, cwd: string) => Promise<void>
    input: (id: string, data: string) => Promise<void>
    resize: (id: string, cols: number, rows: number) => Promise<void>
    kill: (id: string) => Promise<void>
    onData: (cb: (id: string, data: string) => void) => () => void
    onExit: (cb: (id: string, exitCode: number) => void) => () => void
  }
  git: {
    status: (cwd: string) => Promise<unknown>
    diff: (cwd: string, file: string) => Promise<string>
    stage: (cwd: string, file: string) => Promise<void>
    unstage: (cwd: string, file: string) => Promise<void>
    commit: (cwd: string, message: string) => Promise<void>
    branch: (cwd: string) => Promise<string>
  }
  search: {
    find: (root: string, query: string, options: unknown) => Promise<unknown>
    cancel: () => Promise<void>
  }
  config: {
    get: () => Promise<unknown>
    set: (partial: unknown) => Promise<void>
    onChange: (cb: (settings: unknown) => void) => () => void
  }
  dialog: {
    openFolder: () => Promise<string | null>
    openFile: () => Promise<string | null>
    showMessage: (options: unknown) => Promise<number>
  }
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
