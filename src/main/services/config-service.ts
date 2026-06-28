import fs from 'fs'
import fsp from 'fs/promises'
import path from 'path'
import os from 'os'
import { watch, FSWatcher } from 'chokidar'
import type { BrowserWindow } from 'electron'

type Settings = Record<string, unknown>

const DEFAULT_SETTINGS: Settings = {
  'workbench.colorTheme': 'Dark+',
  'editor.fontSize': 13,
  'editor.minimap.enabled': true
}

/**
 * ConfigService（main 进程）持有用户 settings.json 文件
 *（~/.mini-vscode/settings.json），模拟 VSCode 基于文件的配置系统。
 *
 * - 启动时同步读取，让 config:get 可以立即返回。
 * - 使用 chokidar 监听文件，并在磁盘内容变化时推送 config:onChange
 *   （例如用户在编辑器里修改并保存 settings.json）。
 */
export class ConfigService {
  private readonly dir = path.join(os.homedir(), '.mini-vscode')
  private readonly file = path.join(this.dir, 'settings.json')
  private settings: Settings = { ...DEFAULT_SETTINGS }
  private watcher: FSWatcher | null = null
  private disposed = false

  /** 加载配置（缺失时用默认值创建文件）；启动时调用一次 */
  init(mainWindow: BrowserWindow): void {
    if (this.disposed) return
    try {
      if (!fs.existsSync(this.file)) {
        fs.mkdirSync(this.dir, { recursive: true })
        fs.writeFileSync(this.file, JSON.stringify(DEFAULT_SETTINGS, null, 2), 'utf-8')
        this.settings = { ...DEFAULT_SETTINGS }
      } else {
        this.settings = this.readFromDisk()
      }
    } catch {
      this.settings = { ...DEFAULT_SETTINGS }
    }
    this.startWatching(mainWindow)
  }

  getPath(): string {
    return this.file
  }

  get(): Settings {
    return this.settings
  }

  /** 合并部分更新，并以原子方式写入 */
  async set(partial: Settings): Promise<void> {
    this.settings = { ...this.settings, ...partial }
    await this.writeToDisk(this.settings)
  }

  private readFromDisk(): Settings {
    try {
      const raw = fs.readFileSync(this.file, 'utf-8')
      const parsed = JSON.parse(raw)
      return { ...DEFAULT_SETTINGS, ...parsed }
    } catch {
      // JSON 格式暂时无效（编辑到一半）时保留上一份可用配置
      return this.settings
    }
  }

  private async writeToDisk(settings: Settings): Promise<void> {
    const tmp = `${this.file}.tmp`
    await fsp.writeFile(tmp, JSON.stringify(settings, null, 2), 'utf-8')
    await fsp.rename(tmp, this.file)
  }

  private startWatching(mainWindow: BrowserWindow): void {
    if (this.watcher) return
    this.watcher = watch(this.file, { ignoreInitial: true })
    const reload = (): void => {
      const next = this.readFromDisk()
      this.settings = next
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send('config:onChange', next)
      }
    }
    this.watcher.on('change', reload).on('add', reload)
  }

  async dispose(): Promise<void> {
    if (this.disposed) return
    this.disposed = true
    const watcher = this.watcher
    this.watcher = null
    await watcher?.close()
  }
}
