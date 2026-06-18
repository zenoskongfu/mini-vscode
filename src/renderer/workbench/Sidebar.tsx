import React from 'react'
import './Sidebar.css'

interface SidebarProps {
  className?: string
  activeView: string
}

/**
 * Collapsible sidebar container.
 * Renders the appropriate panel based on the active view from ActivityBar.
 *
 * Phase 1: shows placeholder panels.
 * Phase 2+: each view is replaced with its real component.
 */
export function Sidebar({ className = '', activeView }: SidebarProps): React.JSX.Element {
  const viewTitle: Record<string, string> = {
    explorer:   'EXPLORER',
    search:     'SEARCH',
    scm:        'SOURCE CONTROL',
    extensions: 'EXTENSIONS',
    settings:   'SETTINGS'
  }

  return (
    <aside className={`sidebar ${className}`}>
      <div className="sidebar__header">
        <span className="sidebar__title">{viewTitle[activeView] ?? activeView.toUpperCase()}</span>
      </div>
      <div className="sidebar__content">
        <SidebarPlaceholder view={activeView} />
      </div>
    </aside>
  )
}

function SidebarPlaceholder({ view }: { view: string }): React.JSX.Element {
  const descriptions: Record<string, string> = {
    explorer:   'Open a folder to browse files',
    search:     'Search across files in the workspace',
    scm:        'Git status and source control',
    extensions: 'Manage extensions',
    settings:   'Configure the editor'
  }

  return (
    <div className="sidebar-placeholder">
      <p className="sidebar-placeholder__text">
        {descriptions[view] ?? `${view} panel`}
      </p>
      <p className="sidebar-placeholder__hint">— coming in a later phase —</p>
    </div>
  )
}
