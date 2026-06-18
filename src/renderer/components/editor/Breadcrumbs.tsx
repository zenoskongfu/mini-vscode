import React from 'react'
import { getWorkspaceRoot } from '../../store/workspace-store'
import './Breadcrumbs.css'

interface BreadcrumbsProps {
  filePath: string
}

/**
 * Path breadcrumb shown above the editor.
 * Shows the file path relative to the workspace root, segment by segment.
 */
export function Breadcrumbs({ filePath }: BreadcrumbsProps): React.JSX.Element {
  const root = getWorkspaceRoot()

  // Display path relative to workspace root when possible
  let relative = filePath
  if (root && filePath.startsWith(root)) {
    relative = filePath.slice(root.length).replace(/^\//, '')
  }
  const segments = relative.split('/').filter(Boolean)

  return (
    <div className="breadcrumbs">
      {segments.map((segment, i) => (
        <React.Fragment key={i}>
          <span
            className={
              i === segments.length - 1
                ? 'breadcrumbs__segment breadcrumbs__segment--active'
                : 'breadcrumbs__segment'
            }
          >
            {segment}
          </span>
          {i < segments.length - 1 && (
            <span className="breadcrumbs__sep">
              <ChevronIcon />
            </span>
          )}
        </React.Fragment>
      ))}
    </div>
  )
}

function ChevronIcon(): React.JSX.Element {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2">
      <path d="M3.5 2.5L6 5l-2.5 2.5" />
    </svg>
  )
}
