import React, { useRef, useCallback } from 'react'
import Editor, { type OnMount, type OnChange } from '@monaco-editor/react'
import type { editor } from 'monaco-editor'
import { getLanguageForPath } from '../../services/monaco-setup'
import './MonacoEditor.css'

interface MonacoEditorProps {
  path: string
  value: string
  onChange: (value: string) => void
  onSave: (value: string) => void
  onCursorChange?: (line: number, column: number) => void
}

/**
 * Monaco editor wrapper.
 *
 * Passing the `path` prop lets @monaco-editor/react maintain ONE model per file path —
 * switching tabs preserves each file's undo stack and view state (cursor, scroll),
 * mirroring how VSCode's EditorService keeps text models alive in the background.
 */
export function MonacoEditor({
  path,
  value,
  onChange,
  onSave,
  onCursorChange
}: MonacoEditorProps): React.JSX.Element {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
  // Keep latest value in a ref so the Cmd+S command always saves current content
  const valueRef = useRef(value)
  valueRef.current = value

  const handleMount: OnMount = useCallback((editorInstance, monaco) => {
    editorRef.current = editorInstance

    // Cmd/Ctrl+S → save
    editorInstance.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
      () => onSave(valueRef.current)
    )

    // Report cursor position to the status bar
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
        theme="vs-dark"
        onMount={handleMount}
        onChange={handleChange}
        keepCurrentModel
        options={{
          fontFamily: 'var(--font-family-mono)',
          fontSize: 13,
          minimap: { enabled: true },
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
