/**
 * Browser-preview mock for window.electronAPI.
 * Only injected when running outside Electron (no preload script).
 * Stubs all IPC calls so the UI renders without crashing.
 */

const noop = (): Promise<void> => Promise.resolve()
const noopCleanup = (): (() => void) => () => undefined

/**
 * A fake terminal that echoes typed input back (with a prompt + line editing),
 * so the xterm UI is verifiable in the browser preview without a real pty.
 */
function createTerminalEchoMock(): Window['electronAPI']['terminal'] {
  const dataCbs = new Set<(id: string, data: string) => void>()
  const lineBuf = new Map<string, string>()
  const PROMPT = '\x1b[32mpreview\x1b[0m$ '

  const emit = (id: string, data: string): void => dataCbs.forEach(cb => cb(id, data))

  return {
    create: (id: string) => {
      lineBuf.set(id, '')
      setTimeout(() => emit(id, `Mini VSCode preview terminal (echo mock)\r\n${PROMPT}`), 0)
      return Promise.resolve()
    },
    input: (id: string, data: string) => {
      let line = lineBuf.get(id) ?? ''
      for (const ch of data) {
        if (ch === '\r') {
          emit(id, `\r\n${line ? `you typed: ${line}` : ''}${line ? '\r\n' : ''}${PROMPT}`)
          line = ''
        } else if (ch === '\x7f') {
          if (line.length > 0) { line = line.slice(0, -1); emit(id, '\b \b') }
        } else {
          line += ch
          emit(id, ch) // echo
        }
      }
      lineBuf.set(id, line)
      return Promise.resolve()
    },
    resize: noop,
    kill: (id: string) => { lineBuf.delete(id); return Promise.resolve() },
    onData: (cb: (id: string, data: string) => void) => {
      dataCbs.add(cb)
      return () => dataCbs.delete(cb)
    },
    onExit: noopCleanup
  }
}

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

/**
 * Stateful config mock — `set` merges + notifies onChange listeners, so theme
 * toggling and live settings updates are verifiable in the browser preview.
 */
function createConfigMock(): Window['electronAPI']['config'] {
  let settings: Record<string, unknown> = {
    'workbench.colorTheme': 'Dark+',
    'editor.fontSize': 13,
    'editor.minimap.enabled': true
  }
  const cbs = new Set<(s: Record<string, unknown>) => void>()
  return {
    get: () => Promise.resolve(settings),
    set: (partial: Record<string, unknown>) => {
      settings = { ...settings, ...partial }
      cbs.forEach(cb => cb(settings))
      return Promise.resolve()
    },
    getPath: () => Promise.resolve('/preview/.mini-vscode/settings.json'),
    onChange: (cb: (s: Record<string, unknown>) => void) => {
      cbs.add(cb)
      return () => cbs.delete(cb)
    }
  }
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
    terminal: createTerminalEchoMock(),
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
    config: createConfigMock(),
    dialog: {
      openFolder: () => Promise.resolve(FAKE_ROOT),
      openFile: () => Promise.resolve(null),
      showMessage: () => Promise.resolve(0)
    }
  }

  // @ts-ignore — intentional polyfill for browser preview
  window.electronAPI = mock
}
