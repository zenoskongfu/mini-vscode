import React, { useState } from 'react'
import './Panel.css'

interface PanelProps {
  className?: string
}

type PanelTab = 'terminal' | 'problems' | 'output'

/**
 * Bottom panel container.
 * Hosts: Terminal, Problems, Output tabs (matching VSCode's panel structure).
 * Phase 1: placeholder content. Phase 5+: real implementations.
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

      {/* Content */}
      <div className="panel__content">
        {activeTab === 'terminal' && (
          <div className="panel-placeholder">
            <span className="panel-placeholder__text">
              Terminal — available in Phase 5
            </span>
          </div>
        )}
        {activeTab === 'problems' && (
          <div className="panel-placeholder">
            <span className="panel-placeholder__text">
              No problems detected.
            </span>
          </div>
        )}
        {activeTab === 'output' && (
          <div className="panel-placeholder">
            <span className="panel-placeholder__text">
              Output channel — available in Phase 9
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
