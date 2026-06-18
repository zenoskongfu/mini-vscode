/**
 * Browser-preview mock for window.electronAPI.
 * Only injected when running outside Electron (no preload script).
 * Stubs all IPC calls so the UI renders without crashing.
 */

const noop = (): Promise<void> => Promise.resolve()
const noopCleanup = (): (() => void) => () => undefined

// A tiny fake workspace so the browser preview can exercise the Explorer + editor.
const FAKE_ROOT = '/preview/mini-vscode'
const FAKE_FILES: Record<string, string> = {
  [`${FAKE_ROOT}/README.md`]: '# Mini VSCode\n\nA learning project built with Electron + React + Monaco.\n\n- File Explorer\n- Monaco editor with tabs\n- Integrated terminal (coming soon)\n',
  [`${FAKE_ROOT}/index.ts`]: 'interface Greeting {\n  name: string\n  message: string\n}\n\nfunction greet(g: Greeting): string {\n  return `${g.message}, ${g.name}!`\n}\n\nconst result = greet({ name: "World", message: "Hello" })\nconsole.log(result)\n',
  [`${FAKE_ROOT}/styles.css`]: '.app {\n  display: flex;\n  flex-direction: column;\n  color: #cccccc;\n  background: #1e1e1e;\n}\n'
}
const FAKE_DIRS: Record<string, Array<{ name: string; path: string; isDirectory: boolean }>> = {
  [FAKE_ROOT]: [
    { name: 'src', path: `${FAKE_ROOT}/src`, isDirectory: true },
    { name: 'README.md', path: `${FAKE_ROOT}/README.md`, isDirectory: false },
    { name: 'index.ts', path: `${FAKE_ROOT}/index.ts`, isDirectory: false },
    { name: 'styles.css', path: `${FAKE_ROOT}/styles.css`, isDirectory: false }
  ],
  [`${FAKE_ROOT}/src`]: [
    { name: 'app.tsx', path: `${FAKE_ROOT}/src/app.tsx`, isDirectory: false }
  ]
}

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
      readDir: (path: string) => Promise.resolve(FAKE_DIRS[path] ?? []),
      readFile: (path: string) =>
        Promise.resolve(FAKE_FILES[path] ?? `// ${path}\n// (preview mock content)\n`),
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
      openFolder: () => Promise.resolve(FAKE_ROOT),
      openFile: () => Promise.resolve(null),
      showMessage: () => Promise.resolve(0)
    }
  }

  // @ts-ignore — intentional polyfill for browser preview
  window.electronAPI = mock
}
