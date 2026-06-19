import React, { useCallback, useState } from 'react'
import { useService } from '../../platform/ServicesContext'
import { useEvent } from '../../platform/useEvent'
import { IWorkspaceService } from '../../services/workspace/workspaceService'
import { useDirectoryChildren } from './useDirectoryChildren'
import { FileTree } from './FileTree'
import './FileExplorer.css'

interface FileExplorerProps {
  onOpenFile: (path: string) => void
}

/**
 * The Explorer sidebar panel.
 *
 * - No workspace: shows "Open Folder" button
 * - Workspace open: shows workspace name + root file tree + action toolbar
 */
export function FileExplorer({ onOpenFile }: FileExplorerProps): React.JSX.Element {
  const workspaceService = useService(IWorkspaceService)
  const root = useEvent(workspaceService.onDidChangeRoot, () => workspaceService.root)

  if (!root) {
    return <NoWorkspace />
  }

  return <WorkspaceView root={root} onOpenFile={onOpenFile} />
}

function NoWorkspace(): React.JSX.Element {
  const workspaceService = useService(IWorkspaceService)
  const handleOpen = useCallback(() => {
    workspaceService.openFolder()
  }, [workspaceService])

  return (
    <div className="file-explorer__no-workspace">
      <p className="file-explorer__hint">
        You have not yet opened a folder.
      </p>
      <button className="file-explorer__open-btn" onClick={handleOpen}>
        Open Folder
      </button>
    </div>
  )
}

function WorkspaceView({
  root,
  onOpenFile
}: {
  root: string
  onOpenFile: (path: string) => void
}): React.JSX.Element {
  const workspaceService = useService(IWorkspaceService)
  const folderName = root.split('/').pop() ?? root
  const { reload } = useDirectoryChildren(root)
  const [creating, setCreating] = useState<'file' | 'folder' | null>(null)
  const [newName, setNewName] = useState('')

  const commitCreate = useCallback(async () => {
    const name = newName.trim()
    if (name) {
      if (creating === 'file') {
        await window.electronAPI.fs.createFile(`${root}/${name}`)
      } else {
        await window.electronAPI.fs.createDir(`${root}/${name}`)
      }
      reload()
    }
    setCreating(null)
    setNewName('')
  }, [creating, newName, root, reload])

  return (
    <div className="file-explorer">
      {/* Workspace header */}
      <div className="file-explorer__workspace-header">
        <span className="file-explorer__workspace-name" title={root}>
          {folderName.toUpperCase()}
        </span>
        <div className="file-explorer__actions">
          <ActionButton
            title="New File (N)"
            onClick={() => { setCreating('file'); setNewName('') }}
          >
            <NewFileIcon />
          </ActionButton>
          <ActionButton
            title="New Folder (Shift+N)"
            onClick={() => { setCreating('folder'); setNewName('') }}
          >
            <NewFolderIcon />
          </ActionButton>
          <ActionButton title="Refresh" onClick={reload}>
            <RefreshIcon />
          </ActionButton>
          <ActionButton
            title="Close Folder"
            onClick={() => workspaceService.closeFolder()}
          >
            <CloseFolderIcon />
          </ActionButton>
        </div>
      </div>

      {/* Inline new-file/folder input at root level */}
      {creating && (
        <div className="file-explorer__inline-create">
          <input
            className="file-explorer__inline-input"
            autoFocus
            placeholder={creating === 'file' ? 'filename.ts' : 'folder name'}
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') commitCreate()
              if (e.key === 'Escape') { setCreating(null); setNewName('') }
            }}
            onBlur={commitCreate}
          />
        </div>
      )}

      {/* File tree */}
      <div className="file-explorer__tree">
        <FileTree dirPath={root} depth={0} onOpenFile={onOpenFile} />
      </div>
    </div>
  )
}

function ActionButton({
  title,
  onClick,
  children
}: {
  title: string
  onClick: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <button className="file-explorer__action-btn" title={title} onClick={onClick}>
      {children}
    </button>
  )
}

// ── SVG Icons ──────────────────────────────────────────────────

function NewFileIcon(): React.JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <path d="M9 1H4a1 1 0 00-1 1v12a1 1 0 001 1h8a1 1 0 001-1V5L9 1z" opacity="0.4"/>
      <path d="M9 1v4h4"/>
      <path d="M8 11V8M6.5 9.5h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  )
}

function NewFolderIcon(): React.JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <path d="M1 3.5C1 2.67 1.67 2 2.5 2H6l1.5 2H13.5C14.33 4 15 4.67 15 5.5v7c0 .83-.67 1.5-1.5 1.5h-11C1.67 14 1 13.33 1 12.5v-9z" opacity="0.4"/>
      <path d="M8 7.5v4M6 9.5h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  )
}

function RefreshIcon(): React.JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M13 8A5 5 0 112.5 6"/>
      <path d="M1 3.5L2.5 6 5 4.5"/>
    </svg>
  )
}

function CloseFolderIcon(): React.JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M5.5 5.5l5 5M10.5 5.5l-5 5"/>
    </svg>
  )
}
