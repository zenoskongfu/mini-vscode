import { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'

// Web worker：Vite 会通过 ?worker 后缀分别打包，让 Monaco 可离线运行
// （不依赖 CDN），这在 Electron 内是必需的。
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker'
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'

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
