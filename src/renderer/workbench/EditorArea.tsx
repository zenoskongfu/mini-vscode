import React from 'react'
import './EditorArea.css'

interface EditorAreaProps {
  className?: string
}

/**
 * Editor area: hosts the tab strip and the Monaco editor.
 * Phase 1: placeholder welcome screen.
 * Phase 3: replaced with MonacoEditor + EditorTabs + Breadcrumbs.
 */
export function EditorArea({ className = '' }: EditorAreaProps): React.JSX.Element {
  return (
    <div className={`editor-area ${className}`}>
      <WelcomeScreen />
    </div>
  )
}

function WelcomeScreen(): React.JSX.Element {
  return (
    <div className="welcome-screen">
      <div className="welcome-screen__logo">
        {/* Mini VSCode logo — simplified bracket icon */}
        <svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect width="80" height="80" rx="8" fill="#007acc" />
          <path
            d="M56 16L32 40l24 24"
            stroke="white" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" fill="none"
          />
          <path
            d="M24 24l-8 16 8 16"
            stroke="rgba(255,255,255,0.6)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none"
          />
        </svg>
      </div>
      <h1 className="welcome-screen__title">Mini VSCode</h1>
      <p className="welcome-screen__subtitle">A learning project — Electron + React + Monaco</p>

      <div className="welcome-screen__shortcuts">
        <div className="welcome-screen__shortcut-row">
          <kbd>Ctrl+Shift+E</kbd>
          <span>Explorer</span>
        </div>
        <div className="welcome-screen__shortcut-row">
          <kbd>Ctrl+Shift+F</kbd>
          <span>Search</span>
        </div>
        <div className="welcome-screen__shortcut-row">
          <kbd>Ctrl+Shift+P</kbd>
          <span>Command Palette</span>
        </div>
        <div className="welcome-screen__shortcut-row">
          <kbd>Ctrl+`</kbd>
          <span>Toggle Terminal</span>
        </div>
      </div>
    </div>
  )
}
