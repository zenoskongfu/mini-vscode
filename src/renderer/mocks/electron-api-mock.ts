/**
 * Browser-preview mock for window.electronAPI.
 * Only injected when running outside Electron (no preload script).
 * Stubs all IPC calls so the UI renders without crashing.
 */

const noop = (): Promise<void> => Promise.resolve()
const noopCleanup = (): (() => void) => () => undefined

export function injectElectronAPIMock(): void {
  if (typeof window !== 'undefined' && window.electronAPI) return  // real preload present

  const mock: Window['electronAPI'] = {
    window: {
      minimize: noop,
      maximize: noop,
      close: noop,
      isMaximized: () => Promise.resolve(false),
      onMaximizeChange: noopCleanup
    },
    fs: {
      readDir: () => Promise.resolve([]),
      readFile: () => Promise.resolve('(preview mode — file content not available)'),
      writeFile: noop,
      createFile: noop,
      createDir: noop,
      rename: noop,
      delete: noop,
      watchStart: noop,
      watchStop: noop,
      onChange: noopCleanup
    },
    terminal: {
      create: noop,
      input: noop,
      resize: noop,
      kill: noop,
      onData: noopCleanup
    },
    git: {
      status: () => Promise.resolve({}),
      diff: () => Promise.resolve(''),
      stage: noop,
      unstage: noop,
      commit: noop,
      branch: () => Promise.resolve('main')
    },
    search: {
      find: () => Promise.resolve([]),
      cancel: noop
    },
    config: {
      get: () => Promise.resolve({}),
      set: noop,
      onChange: noopCleanup
    },
    dialog: {
      openFolder: () => Promise.resolve(null),
      openFile: () => Promise.resolve(null),
      showMessage: () => Promise.resolve(0)
    }
  }

  // @ts-ignore — intentional polyfill for browser preview
  window.electronAPI = mock
}
