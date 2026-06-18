/** A node in the workspace file tree */
export interface FileNode {
  name: string
  path: string
  isDirectory: boolean
  children?: FileNode[]
}

/** Event pushed by main when chokidar detects a change */
export interface FileChangeEvent {
  type: 'add' | 'addDir' | 'change' | 'unlink' | 'unlinkDir'
  path: string
}
