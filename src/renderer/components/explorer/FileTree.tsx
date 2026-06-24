import React from 'react'
import { useDirectoryChildren } from './useDirectoryChildren'
import { FileTreeNode } from './FileTreeNode'
import './FileTree.css'

interface FileTreeProps {
  dirPath: string
  depth: number
  onOpenFile: (path: string) => void
}

/**
 * 渲染某个目录的子节点。
 * 当目录展开时，会由 FileTreeNode 递归调用。
 */
export function FileTree({ dirPath, depth, onOpenFile }: FileTreeProps): React.JSX.Element {
  const { children, loading, reload } = useDirectoryChildren(dirPath)

  if (loading && children.length === 0) {
    return (
      <div className="file-tree__loading" style={{ paddingLeft: depth * 12 + 8 }}>
        Loading…
      </div>
    )
  }

  if (children.length === 0) {
    return (
      <div className="file-tree__empty" style={{ paddingLeft: depth * 12 + 8 }}>
        (empty)
      </div>
    )
  }

  return (
    <div className="file-tree">
      {children.map(node => (
        <FileTreeNode
          key={node.path}
          node={node}
          depth={depth}
          onOpenFile={onOpenFile}
          onRefreshParent={reload}
        />
      ))}
    </div>
  )
}
