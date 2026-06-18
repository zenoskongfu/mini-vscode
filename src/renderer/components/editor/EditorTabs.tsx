import React from 'react'
import type { EditorTab } from '../../store/editor-store'
import './EditorTabs.css'

interface EditorTabsProps {
  tabs: EditorTab[]
  activePath: string | null
  onActivate: (path: string) => void
  onClose: (path: string) => void
}

/**
 * Horizontal strip of open editor tabs.
 * Each tab shows: file icon, name, and a close button (or a dirty dot when modified).
 */
export function EditorTabs({
  tabs,
  activePath,
  onActivate,
  onClose
}: EditorTabsProps): React.JSX.Element {
  return (
    <div className="editor-tabs" role="tablist">
      {tabs.map(tab => {
        const active = tab.path === activePath
        return (
          <div
            key={tab.path}
            role="tab"
            aria-selected={active}
            className={`editor-tab ${active ? 'editor-tab--active' : ''}`}
            onClick={() => onActivate(tab.path)}
            onMouseDown={e => {
              // middle-click closes
              if (e.button === 1) { e.preventDefault(); onClose(tab.path) }
            }}
            title={tab.path}
          >
            <span className="editor-tab__icon">
              <FileIcon name={tab.name} />
            </span>
            <span className="editor-tab__name">{tab.name}</span>

            <button
              className={`editor-tab__close ${tab.dirty ? 'editor-tab__close--dirty' : ''}`}
              onClick={e => { e.stopPropagation(); onClose(tab.path) }}
              title={tab.dirty ? 'Unsaved changes' : 'Close'}
            >
              {tab.dirty ? <span className="editor-tab__dirty-dot" /> : <CloseIcon />}
            </button>
          </div>
        )
      })}
    </div>
  )
}

function CloseIcon(): React.JSX.Element {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
      <path d="M3 3l6 6M9 3l-6 6" />
    </svg>
  )
}

function FileIcon({ name }: { name: string }): React.JSX.Element {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  const color = FILE_COLORS[ext] ?? '#cccccc'
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path d="M4 1h6l4 4v10H4V1z" fill={color} opacity="0.85" />
      <path d="M10 1l4 4h-4V1z" fill={color} opacity="0.5" />
    </svg>
  )
}

const FILE_COLORS: Record<string, string> = {
  ts: '#3178c6', tsx: '#3178c6',
  js: '#f0db4f', jsx: '#f0db4f', json: '#f0db4f',
  css: '#42a5f5', scss: '#c06', html: '#e44d26',
  md: '#ffffff', py: '#3572a5', rs: '#dea584', go: '#00acd7',
  sh: '#89e051', yml: '#cb171e', yaml: '#cb171e', svg: '#ffb13b'
}
