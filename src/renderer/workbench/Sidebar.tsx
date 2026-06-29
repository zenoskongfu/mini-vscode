import React from 'react'
import { FileExplorer } from '../components/explorer/FileExplorer'
import { ExtensionsView } from '../components/extensions/ExtensionsView'
import { DebugView } from '../components/debug/DebugView'
import './Sidebar.css'

interface SidebarProps {
  className?: string
  activeView: string
  onOpenFile: (path: string) => void
}

export function Sidebar({ className = '', activeView, onOpenFile }: SidebarProps): React.JSX.Element {
  const viewTitle: Record<string, string> = {
    explorer:   'EXPLORER',
    search:     'SEARCH',
    scm:        'SOURCE CONTROL',
    debug:      'RUN AND DEBUG',
    extensions: 'EXTENSIONS',
    settings:   'SETTINGS'
  }

  return (
    <aside className={`sidebar ${className}`}>
      <div className="sidebar__header">
        <span className="sidebar__title">{viewTitle[activeView] ?? activeView.toUpperCase()}</span>
      </div>
      <div className="sidebar__content">
        {activeView === 'explorer' ? (
          <FileExplorer onOpenFile={onOpenFile} />
        ) : activeView === 'extensions' ? (
          <ExtensionsView />
        ) : activeView === 'debug' ? (
          <DebugView />
        ) : (
          <SidebarPlaceholder view={activeView} />
        )}
      </div>
    </aside>
  )
}

function SidebarPlaceholder({ view }: { view: string }): React.JSX.Element {
  const descriptions: Record<string, string> = {
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
