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
  /** Active chokidar watchers keyed by the watched root path */
  private watchers = new Map<string, FSWatcher>()

  // ── Read operations ─────────────────────────────────────────

  async readDir(dirPath: string): Promise<FileNode[]> {
    const entries = await fs.readdir(dirPath, { withFileTypes: true })

    const nodes: FileNode[] = entries
      .filter(e => !e.name.startsWith('.'))   // hide dot-files
      .map(e => ({
        name: e.name,
        path: path.join(dirPath, e.name),
        isDirectory: e.isDirectory()
      }))

    // Directories first, then files — both sorted alphabetically
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

  // ── Write operations ─────────────────────────────────────────

  async writeFile(filePath: string, content: string): Promise<void> {
    await fs.writeFile(filePath, content, 'utf-8')
  }

  async createFile(filePath: string): Promise<void> {
    // Ensure parent directory exists, then create the file
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

  // ── File watching ────────────────────────────────────────────

  /**
   * Start watching a directory. When changes occur, push FileChangeEvent
   * to the renderer via mainWindow.webContents.send('fs:onChange', event).
   */
  watchStart(rootPath: string, mainWindow: BrowserWindow): void {
    if (this.watchers.has(rootPath)) return  // already watching

    const watcher = watch(rootPath, {
      ignored: [
        /(^|[/\\])\../,       // dot-files
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
    await watcher.close()
    this.watchers.delete(rootPath)
  }

  async stopAll(): Promise<void> {
    await Promise.all([...this.watchers.values()].map(w => w.close()))
    this.watchers.clear()
  }
}
