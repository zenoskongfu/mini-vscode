import React, { useRef, useCallback } from 'react'
import Editor, { type OnMount, type OnChange } from '@monaco-editor/react'
import type { editor } from 'monaco-editor'
import { getLanguageForPath } from '../../services/monaco-setup'
import { useService } from '../../platform/ServicesContext'
import { useEvent } from '../../platform/useEvent'
import { IConfigurationService } from '../../services/configuration/configurationService'
import { IThemeService } from '../../services/theme/themeService'
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
  // 用 ref 保存最新内容，确保 Cmd+S 总能保存当前内容
  const valueRef = useRef(value)
  valueRef.current = value

  // 编辑器选项与主题来自配置（保存 settings.json 后实时更新）
  const configurationService = useService(IConfigurationService)
  const themeService = useService(IThemeService)
  const fontSize = useEvent(
    configurationService.onDidChangeConfiguration,
    () => configurationService.getValue<number>('editor.fontSize', 13)
  )
  const minimap = useEvent(
    configurationService.onDidChangeConfiguration,
    () => configurationService.getValue<boolean>('editor.minimap.enabled', true)
  )
  const monacoTheme = useEvent(themeService.onDidChangeTheme, () => themeService.getMonacoBase())

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
  }, [onSave, onCursorChange])

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
