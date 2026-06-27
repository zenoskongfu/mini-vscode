import { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import type { ThemeDefinition } from '../themes/theme-types'
import { darkPlus } from '../themes/dark-plus'
import { lightPlus } from '../themes/light-plus'

// Web worker：Vite 会通过 ?worker 后缀分别打包，让 Monaco 可离线运行
// （不依赖 CDN），这在 Electron 内是必需的。
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker'
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'

// 让其它服务（ThemeService / DiagnosticsService）拿到同一个 monaco 实例，
// 而不是依赖调试用的 globalThis.__monaco（Phase 6.7 #3 的架构异味收口）。
export { monaco }

let initialized = false

/**
 * 将 Monaco 接到本地打包的 monaco-editor 实例及其 web worker。
 * 必须在任何编辑器挂载前调用一次。
 */
export function setupMonaco(): void {
  if (initialized) return
  initialized = true

  // 告诉 @monaco-editor/react 使用本地打包的 monaco，而不是 CDN
  loader.config({ monaco })

  // 暴露 monaco 实例，便于调试和 DevTools 检查
  ;(globalThis as Record<string, unknown>).__monaco = monaco

  // 注册各语言 worker
  self.MonacoEnvironment = {
    getWorker(_workerId: string, label: string): Worker {
      switch (label) {
        case 'json':
          return new jsonWorker()
        case 'css':
        case 'scss':
        case 'less':
          return new cssWorker()
        case 'html':
        case 'handlebars':
        case 'razor':
          return new htmlWorker()
        case 'typescript':
        case 'javascript':
          return new tsWorker()
        default:
          return new editorWorker()
      }
    }
  }

  configureTypeScript()
  // 预先定义两套自定义主题，保证编辑器首帧主题名就存在（避免闪烁）
  defineMonacoTheme(darkPlus)
  defineMonacoTheme(lightPlus)
  monaco.editor.setTheme(monacoThemeName(darkPlus.id))
}

/**
 * 配置内置 TS/JS 语言服务（Phase 13.0）：
 * - 编译选项：开 jsx、模块解析，让 .tsx 与跨文件类型更准
 * - 诊断：TS 开语义+语法校验（红波浪线）；JS 仅语法（避免裸 JS 噪声）
 */
function configureTypeScript(): void {
  const ts = monaco.languages.typescript
  const compilerOptions: monaco.languages.typescript.CompilerOptions = {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    jsx: ts.JsxEmit.React,
    allowJs: true,
    allowNonTsExtensions: true,
    esModuleInterop: true,
    skipLibCheck: true,
    noEmit: true
  }
  ts.typescriptDefaults.setCompilerOptions(compilerOptions)
  ts.javascriptDefaults.setCompilerOptions(compilerOptions)

  // 保真路线（Phase 13.2+）：关掉内置 TS/JS worker 的全部语言特性，
  // 让扩展（gallery/ts-definition）独占定义；诊断一并关掉以消除 import 红线。
  // 注意：语法/语义着色来自 Monarch + 主题 tokenRules，与 worker 无关，故不受影响。
  const allOff: monaco.languages.typescript.ModeConfiguration = {
    completionItems: false,
    hovers: false,
    documentSymbols: false,
    definitions: false,
    references: false,
    documentHighlights: false,
    rename: false,
    diagnostics: false,
    documentRangeFormattingEdits: false,
    signatureHelp: false,
    onTypeFormattingEdits: false,
    codeActions: false,
    inlayHints: false
  }
  const diagOff = { noSemanticValidation: true, noSyntaxValidation: true, noSuggestionDiagnostics: true }
  ts.typescriptDefaults.setModeConfiguration(allOff)
  ts.javascriptDefaults.setModeConfiguration(allOff)
  ts.typescriptDefaults.setDiagnosticsOptions(diagOff)
  ts.javascriptDefaults.setDiagnosticsOptions(diagOff)
}

/**
 * 一个主题的 Monaco 主题名（与 CSS 变量主题区分）。
 * Monaco 的 defineTheme 只接受 /^[a-z0-9-]+$/i，因此要净化掉
 * 主题 id 里的非法字符（如 "Dark+" 的 `+`），否则会抛 "Illegal theme name!"。
 */
export function monacoThemeName(themeId: string): string {
  return ('mini-' + themeId).replace(/[^a-z0-9-]/gi, '-')
}

/** 用主题里的语法规则 + CSS 调色板，注册成 Monaco 自定义主题 */
function defineMonacoTheme(theme: ThemeDefinition): void {
  monaco.editor.defineTheme(monacoThemeName(theme.id), {
    base: theme.monacoBase,
    inherit: true,
    rules: (theme.tokenRules ?? []).map(r => {
      const rule: monaco.editor.ITokenThemeRule = { token: r.token }
      if (r.foreground) rule.foreground = r.foreground.replace(/^#/, '')
      if (r.fontStyle) rule.fontStyle = r.fontStyle
      return rule
    }),
    colors: buildEditorColors(theme)
  })
}

/** 把工作区调色板（CSS 变量）映射成 Monaco 的 editor.* 颜色键 */
function buildEditorColors(theme: ThemeDefinition): Record<string, string> {
  const c = theme.colors
  const colors: Record<string, string> = {}
  const set = (key: string, varName: string): void => {
    const v = c[varName]
    if (v && v.startsWith('#')) colors[key] = v
  }
  set('editor.background', '--color-bg-editor')
  set('editor.foreground', '--color-fg-default')
  set('editor.lineHighlightBackground', '--color-editor-line-highlight')
  set('editorLineNumber.foreground', '--color-editor-line-number')
  set('editorLineNumber.activeForeground', '--color-editor-line-number-active')
  set('editorCursor.foreground', '--color-editor-cursor')
  set('editor.selectionBackground', '--color-editor-selection')
  return colors
}

/** 将文件扩展名映射为 Monaco language id */
export function getLanguageForPath(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript',
    js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
    json: 'json',
    css: 'css', scss: 'scss', less: 'less',
    html: 'html', htm: 'html',
    md: 'markdown', markdown: 'markdown',
    py: 'python',
    rs: 'rust',
    go: 'go',
    java: 'java',
    c: 'c', h: 'c',
    cpp: 'cpp', cc: 'cpp', hpp: 'cpp',
    sh: 'shell', bash: 'shell', zsh: 'shell',
    yml: 'yaml', yaml: 'yaml',
    xml: 'xml', svg: 'xml',
    sql: 'sql',
    php: 'php',
    rb: 'ruby',
    vue: 'html',
    toml: 'ini', ini: 'ini'
  }
  return map[ext] ?? 'plaintext'
}
