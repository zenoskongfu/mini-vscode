/**
 * window.electronAPI 的浏览器预览 mock。
 * 只在 Electron 外运行时注入（此时没有 preload 脚本）。
 * 它会 stub 所有 IPC 调用，让 UI 可以正常渲染而不崩溃。
 */

const noop = (): Promise<void> => Promise.resolve()
const noopCleanup = (): (() => void) => () => undefined

/**
 * 一个会回显输入的假终端（带 prompt 和简单行编辑），
 * 这样浏览器预览中无需真实 pty 也能验证 xterm UI。
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
          emit(id, ch) // 回显
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

// 一个很小的假工作区，让浏览器预览能跑通 Explorer 和编辑器。
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
 * 有状态配置 mock：`set` 会合并值并通知 onChange listener，
 * 让主题切换和实时设置更新可以在浏览器预览中验证。
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
  if (typeof window !== 'undefined' && window.electronAPI) return  // 已存在真实 preload

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
        Promise.resolve(FAKE_FILES[path] ?? `// ${path}\n// （预览 mock 内容）\n`),
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
    state: {
      get: () => Promise.resolve(JSON.parse(localStorage.getItem('mini-vscode:state') ?? '{}')),
      set: (partial: Record<string, unknown>) => {
        const s = JSON.parse(localStorage.getItem('mini-vscode:state') ?? '{}')
        localStorage.setItem('mini-vscode:state', JSON.stringify({ ...s, ...partial }))
        return Promise.resolve()
      }
    },
    dialog: {
      openFolder: () => Promise.resolve(FAKE_ROOT),
      openFile: () => Promise.resolve(null),
      showMessage: () => Promise.resolve(0)
    },
    extensions: {
      listGallery: () => Promise.resolve([
        { id: 'word-count', displayName: 'Word Count', description: 'Shows a (mock) word count for the active document.', publisher: 'mini-vscode', version: '1.0.0' },
        { id: 'insert-date', displayName: 'Insert Date', description: 'Adds a command that reports the current date/time.', publisher: 'mini-vscode', version: '1.2.0' },
        { id: 'emoji-log', displayName: 'Emoji Log', description: 'A cheerful command that says hello with emoji.', publisher: 'mini-vscode', version: '0.3.1' }
      ]),
      install: noop,
      uninstall: noop
    }
  }

  // @ts-ignore — 浏览器预览刻意添加的 polyfill
  window.electronAPI = mock
}
