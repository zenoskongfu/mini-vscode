import React, { useState, useEffect } from 'react'
import { useService } from '../platform/ServicesContext'
import { useEvent } from '../platform/useEvent'
import { ITerminalService } from '../services/terminal/terminalService'
import { TerminalView } from '../components/terminal/TerminalView'
import './Panel.css'

interface PanelProps {
  className?: string
}

type PanelTab = 'terminal' | 'problems' | 'output'

/**
 * Bottom panel container.
 * Hosts: Terminal (real pty via xterm), Problems, Output tabs.
 */
export function Panel({ className = '' }: PanelProps): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<PanelTab>('terminal')

  const tabs: { id: PanelTab; label: string; badge?: number }[] = [
    { id: 'terminal', label: 'TERMINAL' },
    { id: 'problems', label: 'PROBLEMS', badge: 0 },
    { id: 'output',   label: 'OUTPUT' }
  ]

  return (
    <div className={`panel ${className}`}>
      {/* Tab strip */}
      <div className="panel__tabs">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`panel__tab ${activeTab === tab.id ? 'panel__tab--active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
            {tab.badge !== undefined && tab.badge > 0 && (
              <span className="panel__tab-badge">{tab.badge}</span>
            )}
          </button>
        ))}
      </div>

      {/* Content — keep terminal mounted (display:none when inactive) so the
          shell session survives tab switches */}
      <div className="panel__content">
        <div
          className="panel__pane"
          style={{ display: activeTab === 'terminal' ? 'block' : 'none' }}
        >
          <TerminalPane active={activeTab === 'terminal'} />
        </div>

        {activeTab === 'problems' && (
          <div className="panel-placeholder">
            <span className="panel-placeholder__text">No problems detected.</span>
          </div>
        )}
        {activeTab === 'output' && (
          <div className="panel-placeholder">
            <span className="panel-placeholder__text">Output channel — available in Phase 9</span>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Lazily creates one terminal the first time the terminal tab is shown,
 * then renders its xterm view.
 */
function TerminalPane({ active }: { active: boolean }): React.JSX.Element {
  const terminalService = useService(ITerminalService)
  const terminals = useEvent(terminalService.onDidChangeTerminals, () => terminalService.terminals)
  const activeId = useEvent(terminalService.onDidChangeTerminals, () => terminalService.activeId)

  // Create the first terminal on first reveal
  useEffect(() => {
    if (active && terminalService.terminals.length === 0) {
      terminalService.createTerminal()
    }
  }, [active, terminalService])

  if (terminals.length === 0) {
    return (
      <div className="panel-placeholder">
        <span className="panel-placeholder__text">Starting terminal…</span>
      </div>
    )
  }

  return (
    <div className="panel__terminal-wrap">
      {/* Terminal toolbar: selector (switch) + new + kill */}
      <div className="terminal-toolbar">
        <div className="terminal-toolbar__selector">
          {terminals.map(t => (
            <button
              key={t.id}
              className={`terminal-toolbar__item ${t.id === activeId ? 'terminal-toolbar__item--active' : ''}`}
              onClick={() => terminalService.setActive(t.id)}
              title={t.title}
            >
              <TerminalIcon />
              <span className="terminal-toolbar__item-label">{t.title}</span>
            </button>
          ))}
        </div>
        <div className="terminal-toolbar__actions">
          <button
            className="terminal-toolbar__action"
            title="New Terminal"
            onClick={() => terminalService.createTerminal()}
          >
            <PlusIcon />
          </button>
          <button
            className="terminal-toolbar__action"
            title="Kill Terminal"
            onClick={() => { if (activeId) terminalService.closeTerminal(activeId) }}
          >
            <TrashIcon />
          </button>
        </div>
      </div>

      {/* Mount every terminal; show only the active one */}
      <div className="panel__terminal-views">
        {terminals.map(t => (
          <div
            key={t.id}
            className="panel__terminal-slot"
            style={{ display: t.id === activeId ? 'block' : 'none' }}
          >
            <TerminalView id={t.id} />
          </div>
        ))}
      </div>
    </div>
  )
}

function TerminalIcon(): React.JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="12" height="10" rx="1.5" />
      <path d="M5 6.5l2 1.5-2 1.5" />
      <path d="M8.5 10h2.5" />
    </svg>
  )
}

function PlusIcon(): React.JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      <path d="M8 3.5v9M3.5 8h9" />
    </svg>
  )
}

function TrashIcon(): React.JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 4.5h10M6.5 4.5V3.5a1 1 0 011-1h1a1 1 0 011 1v1M5 4.5l.5 8a1 1 0 001 1h3a1 1 0 001-1l.5-8" />
    </svg>
  )
}
