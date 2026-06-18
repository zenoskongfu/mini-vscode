import { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'

// Web workers — Vite bundles each via the ?worker suffix so Monaco runs offline
// (no CDN), which is required inside Electron.
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker'
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'

let initialized = false

/**
 * Wire Monaco to use the bundled (local) monaco-editor instance and its web workers.
 * Must be called once before any editor mounts.
 */
export function setupMonaco(): void {
  if (initialized) return
  initialized = true

  // Tell @monaco-editor/react to use the locally bundled monaco rather than CDN
  loader.config({ monaco })

  // Expose the monaco instance for debugging / devtools inspection
  ;(globalThis as Record<string, unknown>).__monaco = monaco

  // Register the language workers
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

/** Map a file extension to a Monaco language id */
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
