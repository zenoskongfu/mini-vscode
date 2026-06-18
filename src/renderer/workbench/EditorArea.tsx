import React, { useEffect, useState } from 'react'
import './EditorArea.css'

interface EditorAreaProps {
  className?: string
  openFilePath: string | null
}

/**
 * Editor area.
 * Phase 2: shows file name + raw text content (plain <pre>).
 * Phase 3: replaced with MonacoEditor + EditorTabs + Breadcrumbs.
 */
export function EditorArea({ className = '', openFilePath }: EditorAreaProps): React.JSX.Element {
  const [content, setContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!openFilePath) { setContent(null); setError(null); return }
    setLoading(true)
    setError(null)
    window.electronAPI.fs.readFile(openFilePath)
      .then((text: string) => { setContent(text); setLoading(false) })
      .catch((e: Error) => { setError(e.message); setLoading(false) })
  }, [openFilePath])

  if (!openFilePath) {
    return (
      <div className={`editor-area ${className}`}>
        <WelcomeScreen />
      </div>
    )
  }

  const fileName = openFilePath.split('/').pop() ?? openFilePath

  return (
    <div className={`editor-area ${className}`}>
      {/* Minimal tab strip — Phase 3 will replace with full EditorTabs */}
      <div className="editor-area__tab-strip">
        <div className="editor-area__tab editor-area__tab--active">
          <span className="editor-area__tab-name">{fileName}</span>
          <span className="editor-area__tab-path">{openFilePath}</span>
        </div>
      </div>

      {/* Minimal breadcrumb */}
      <div className="editor-area__breadcrumb">
        {openFilePath.split('/').map((part, i, arr) => (
          <React.Fragment key={i}>
            <span className={i === arr.length - 1 ? 'editor-area__crumb--active' : 'editor-area__crumb'}>
              {part}
            </span>
            {i < arr.length - 1 && <span className="editor-area__crumb-sep">›</span>}
          </React.Fragment>
        ))}
      </div>

      {/* Content */}
      <div className="editor-area__content selectable">
        {loading && <div className="editor-area__status">Loading…</div>}
        {error   && <div className="editor-area__status editor-area__status--error">{error}</div>}
        {!loading && !error && content !== null && (
          <pre className="editor-area__pre">{content}</pre>
        )}
      </div>
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
