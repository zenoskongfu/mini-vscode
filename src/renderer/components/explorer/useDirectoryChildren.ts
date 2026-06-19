import { useState, useEffect, useCallback } from 'react'
import type { FileNode, FileChangeEvent } from '../../types/file-tree'

/**
 * Loads the children of a directory on demand and keeps them fresh by
 * listening to fs:onChange events that affect this directory.
 *
 * Pure view-helper hook — talks to window.electronAPI.fs directly, independent
 * of any service (the Explorer tree calls it recursively per expanded folder).
 */
export function useDirectoryChildren(dirPath: string | null): {
  children: FileNode[]
  loading: boolean
  reload: () => void
} {
  const [children, setChildren] = useState<FileNode[]>([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (!dirPath) {
      setChildren([])
      return
    }
    setLoading(true)
    try {
      const nodes = (await window.electronAPI.fs.readDir(dirPath)) as FileNode[]
      setChildren(nodes)
    } catch {
      setChildren([])
    } finally {
      setLoading(false)
    }
  }, [dirPath])

  useEffect(() => {
    load()
  }, [load])

  // Re-fetch when a change occurs directly inside this directory
  useEffect(() => {
    if (!dirPath) return
    const cleanup = window.electronAPI.fs.onChange((event: unknown) => {
      const e = event as FileChangeEvent
      const parent = e.path.substring(0, e.path.lastIndexOf('/'))
      if (parent === dirPath) load()
    })
    return cleanup
  }, [dirPath, load])

  return { children, loading, reload: load }
}
