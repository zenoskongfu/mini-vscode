import fs from 'fs/promises'
import path from 'path'
import { watch, FSWatcher } from 'chokidar'
import type { BrowserWindow } from 'electron'

export interface FileNode {
  name: string
  path: string
  isDirectory: boolean
  children?: FileNode[]
}

export interface FileChangeEvent {
  type: 'add' | 'addDir' | 'change' | 'unlink' | 'unlinkDir'
  path: string
}

export class FileSystemService {
  /** 活跃的 chokidar watcher，以被监听的根路径为 key */
  private watchers = new Map<string, FSWatcher>()
  private disposed = false

  // ── 读取操作 ─────────────────────────────────────────

  async readDir(dirPath: string): Promise<FileNode[]> {
    const entries = await fs.readdir(dirPath, { withFileTypes: true })

    const nodes: FileNode[] = entries
      .filter(e => !e.name.startsWith('.'))   // 隐藏点文件
      .map(e => ({
        name: e.name,
        path: path.join(dirPath, e.name),
        isDirectory: e.isDirectory()
      }))

    // 目录在前、文件在后；两组都按字母排序
    nodes.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
      return a.name.localeCompare(b.name)
    })

    return nodes
  }

  async readFile(filePath: string): Promise<string> {
    const content = await fs.readFile(filePath, 'utf-8')
    return content
  }

  async exists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath)
      return true
    } catch {
      return false
    }
  }

  // ── 写入操作 ─────────────────────────────────────────

  async writeFile(filePath: string, content: string): Promise<void> {
    await fs.writeFile(filePath, content, 'utf-8')
  }

  async createFile(filePath: string): Promise<void> {
    // 先确保父目录存在，再创建文件
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, '', 'utf-8')
  }

  async createDir(dirPath: string): Promise<void> {
    await fs.mkdir(dirPath, { recursive: true })
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    await fs.rename(oldPath, newPath)
  }

  async delete(targetPath: string): Promise<void> {
    await fs.rm(targetPath, { recursive: true, force: true })
  }

  // ── 文件监听 ────────────────────────────────────────────

  /**
   * 开始监听目录。发生变化时，通过
   * mainWindow.webContents.send('fs:onChange', event) 把 FileChangeEvent 推给 renderer。
   */
  watchStart(rootPath: string, mainWindow: BrowserWindow): void {
    if (this.disposed) return
    if (this.watchers.has(rootPath)) return  // 已经在监听

    const watcher = watch(rootPath, {
      ignored: [
        /(^|[/\\])\../,       // 点文件
        /node_modules/,
        /\.git/,
        /out\//,
        /dist\//
      ],
      persistent: true,
      ignoreInitial: true,
      depth: 10
    })

    const send = (type: FileChangeEvent['type']) => (filePath: string): void => {
      if (mainWindow.isDestroyed()) return
      const event: FileChangeEvent = { type, path: filePath }
      mainWindow.webContents.send('fs:onChange', event)
    }

    watcher
      .on('add',       send('add'))
      .on('addDir',    send('addDir'))
      .on('change',    send('change'))
      .on('unlink',    send('unlink'))
      .on('unlinkDir', send('unlinkDir'))

    this.watchers.set(rootPath, watcher)
  }

  async watchStop(rootPath: string): Promise<void> {
    const watcher = this.watchers.get(rootPath)
    if (!watcher) return
    this.watchers.delete(rootPath)
    await watcher.close()
  }

  async stopAll(): Promise<void> {
    const watchers = [...this.watchers.values()]
    this.watchers.clear()
    await Promise.allSettled(watchers.map(w => w.close()))
  }

  async dispose(): Promise<void> {
    if (this.disposed) return
    this.disposed = true
    await this.stopAll()
  }
}
