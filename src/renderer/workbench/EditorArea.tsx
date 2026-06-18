import React, { useCallback } from 'react'
import {
  useEditorState,
  activateTab,
  closeTab,
  updateTabContent,
  saveTab
} from '../store/editor-store'
import { EditorTabs } from '../components/editor/EditorTabs'
import { Breadcrumbs } from '../components/editor/Breadcrumbs'
import { MonacoEditor } from '../components/editor/MonacoEditor'
import './EditorArea.css'

interface EditorAreaProps {
  className?: string
  onCursorChange?: (line: number, column: number) => void
}

/**
 * Editor area: tab strip + breadcrumbs + Monaco editor.
 * Reads open tabs from the editor store (TabService).
 */
export function EditorArea({ className = '', onCursorChange }: EditorAreaProps): React.JSX.Element {
  const { tabs, activePath } = useEditorState()
  const activeTab = tabs.find(t => t.path === activePath) ?? null

  const handleChange = useCallback((value: string) => {
    if (activePath) updateTabContent(activePath, value)
  }, [activePath])

  const handleSave = useCallback(() => {
    if (activePath) saveTab(activePath)
  }, [activePath])

  if (!activeTab) {
    return (
      <div className={`editor-area ${className}`}>
        <WelcomeScreen />
      </div>
    )
  }

  return (
    <div className={`editor-area ${className}`}>
      <EditorTabs
        tabs={tabs}
        activePath={activePath}
        onActivate={activateTab}
        onClose={closeTab}
      />
      <Breadcrumbs filePath={activeTab.path} />
      <MonacoEditor
        path={activeTab.path}
        value={activeTab.content}
        onChange={handleChange}
        onSave={handleSave}
        onCursorChange={onCursorChange}
      />
    </div>
  )
}

function WelcomeScreen(): React.JSX.Element {
  return (
    <div className="welcome-screen">
      <div className="welcome-screen__logo">
        <svg width="80" height="80" viewBox="0 0 80 80" fill="none">
          <rect width="80" height="80" rx="8" fill="#007acc" />
          <path d="M56 16L32 40l24 24" stroke="white" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M24 24l-8 16 8 16" stroke="rgba(255,255,255,0.6)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <h1 className="welcome-screen__title">Mini VSCode</h1>
      <p className="welcome-screen__subtitle">A learning project — Electron + React + Monaco</p>
      <div className="welcome-screen__shortcuts">
        <div className="welcome-screen__shortcut-row"><kbd>Ctrl+Shift+E</kbd><span>Explorer</span></div>
        <div className="welcome-screen__shortcut-row"><kbd>Ctrl+Shift+F</kbd><span>Search</span></div>
        <div className="welcome-screen__shortcut-row"><kbd>Ctrl+Shift+P</kbd><span>Command Palette</span></div>
        <div className="welcome-screen__shortcut-row"><kbd>Ctrl+`</kbd><span>Toggle Terminal</span></div>
      </div>
    </div>
  )
}
