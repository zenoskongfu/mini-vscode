import React, { useRef, useCallback, useEffect } from 'react'
import Editor, { type OnMount, type OnChange } from '@monaco-editor/react'
import type { editor } from 'monaco-editor'
import { getLanguageForPath, monaco } from '../../services/monaco-setup'
import { useService } from '../../platform/ServicesContext'
import { useEvent } from '../../platform/useEvent'
import { IConfigurationService } from '../../services/configuration/configurationService'
import { IThemeService } from '../../services/theme/themeService'
import { IEditorService } from '../../services/editor/editorService'
import { IDebugService } from '../../services/debug/debugService'
import './MonacoEditor.css'

interface MonacoEditorProps {
  path: string
  value: string
  onChange: (value: string) => void
  onSave: (value: string) => void
  onCursorChange?: (line: number, column: number) => void
}

/**
 * Monaco 编辑器包装层。
 *
 * 传入 `path` prop 后，@monaco-editor/react 会为每个文件路径维护唯一 model，
 * 切换标签页时可以保留每个文件的 undo 栈和视图状态（光标、滚动），
 * 这模拟了 VSCode EditorService 在后台保持 text model 存活的方式。
 */
export function MonacoEditor({
  path,
  value,
  onChange,
  onSave,
  onCursorChange
}: MonacoEditorProps): React.JSX.Element {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
  const debugDecorations = useRef<editor.IEditorDecorationsCollection | null>(null)
  // 用 ref 保存最新内容，确保 Cmd+S 总能保存当前内容
  const valueRef = useRef(value)
  valueRef.current = value

  const debugService = useService(IDebugService)

  // 编辑器选项与主题来自配置（保存 settings.json 后实时更新）
  const configurationService = useService(IConfigurationService)
  const themeService = useService(IThemeService)
  const editorService = useService(IEditorService)
  const fontSize = useEvent(
    configurationService.onDidChangeConfiguration,
    () => configurationService.getValue<number>('editor.fontSize', 13)
  )
  const minimap = useEvent(
    configurationService.onDidChangeConfiguration,
    () => configurationService.getValue<boolean>('editor.minimap.enabled', true)
  )
  const monacoTheme = useEvent(themeService.onDidChangeTheme, () => themeService.getMonacoThemeName())

  const reveal = useCallback((line: number, column: number): void => {
    const ed = editorRef.current
    if (!ed) return
    ed.revealLineInCenter(line)
    ed.setPosition({ lineNumber: line, column })
    ed.focus()
  }, [])

  // 重画断点（装订线红点）+ 当前停靠行高亮
  const applyDebugDecorations = useCallback((): void => {
    const col = debugDecorations.current
    if (!col) return
    const decos: editor.IModelDeltaDecoration[] = debugService
      .getBreakpointLines(path)
      .map(line => ({
        range: new monaco.Range(line, 1, line, 1),
        options: { glyphMarginClassName: 'debug-bp-glyph', stickiness: 1 }
      }))
    const loc = debugService.stopLocation
    if (loc && loc.path === path) {
      decos.push({
        range: new monaco.Range(loc.line, 1, loc.line, 1),
        options: {
          isWholeLine: true,
          className: 'debug-stop-line',
          glyphMarginClassName: 'debug-stop-glyph'
        }
      })
    }
    col.set(decos)
  }, [debugService, path])

  const handleMount: OnMount = useCallback((editorInstance, monaco) => {
    editorRef.current = editorInstance

    // Cmd/Ctrl+S → 保存
    editorInstance.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
      () => onSave(valueRef.current)
    )

    // 将光标位置上报给状态栏
    editorInstance.onDidChangeCursorPosition(e => {
      onCursorChange?.(e.position.lineNumber, e.position.column)
    })

    // 点击装订线 → 切换断点
    editorInstance.onMouseDown(e => {
      if (
        e.target.type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN &&
        e.target.position
      ) {
        debugService.toggleBreakpoint(path, e.target.position.lineNumber)
      }
    })
    debugDecorations.current = editorInstance.createDecorationsCollection()
    applyDebugDecorations()

    // 兜底：若在本视图挂载之前就有定位请求（如从 Problems 跳转打开新文件）
    const pending = editorService.consumeReveal(path)
    if (pending) reveal(pending.line, pending.column)
  }, [onSave, onCursorChange, editorService, path, reveal, debugService, applyDebugDecorations])

  // 响应「跳转到行列」请求（文件已打开的情况）
  useEffect(() => {
    const d = editorService.onDidRequestReveal(ev => {
      if (ev.path !== path) return
      reveal(ev.line, ev.column)
      editorService.consumeReveal(path)
    })
    return () => d.dispose()
  }, [editorService, path, reveal])

  // 断点 / 当前行变化 → 重画装订线装饰
  useEffect(() => {
    const d1 = debugService.onDidChangeBreakpoints(applyDebugDecorations)
    const d2 = debugService.onDidChangeState(applyDebugDecorations)
    return () => {
      d1.dispose()
      d2.dispose()
    }
  }, [debugService, applyDebugDecorations])

  const handleChange: OnChange = useCallback(value => {
    onChange(value ?? '')
  }, [onChange])

  return (
    <div className="monaco-editor-wrapper">
      <Editor
        path={path}
        language={getLanguageForPath(path)}
        value={value}
        theme={monacoTheme}
        onMount={handleMount}
        onChange={handleChange}
        keepCurrentModel
        options={{
          fontFamily: 'var(--font-family-mono)',
          fontSize,
          minimap: { enabled: minimap },
          scrollBeyondLastLine: false,
          smoothScrolling: true,
          cursorBlinking: 'smooth',
          renderWhitespace: 'selection',
          bracketPairColorization: { enabled: true },
          'semanticHighlighting.enabled': true,
          glyphMargin: true,
          automaticLayout: true,
          tabSize: 2,
          lineNumbers: 'on',
          renderLineHighlight: 'all',
          fixedOverflowWidgets: true
        }}
        loading={<div className="monaco-editor-wrapper__loading">Loading editor…</div>}
      />
    </div>
  )
}
