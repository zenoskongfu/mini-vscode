import { useState, useEffect, useCallback } from 'react'
import type { FileNode, FileChangeEvent } from '../../types/file-tree'

/**
 * 按需加载某个目录的子节点，并通过监听影响该目录的 fs:onChange 事件保持新鲜。
 *
 * 这是纯视图辅助 hook，直接调用 window.electronAPI.fs，独立于任何服务；
 * Explorer 树会针对每个展开的文件夹递归调用它。
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

  // 当变化直接发生在当前目录内时重新拉取
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
