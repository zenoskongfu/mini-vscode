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
 * ConfigService (main process) — owns the user settings.json file
 * (~/.mini-vscode/settings.json), mirroring VSCode's file-backed configuration.
 *
 * - Reads synchronously on startup so `config:get` returns immediately.
 * - Watches the file with chokidar and pushes `config:onChange` when it changes
 *   on disk (e.g. the user edits settings.json in the editor and saves).
 */
export class ConfigService {
  private readonly dir = path.join(os.homedir(), '.mini-vscode')
  private readonly file = path.join(this.dir, 'settings.json')
  private settings: Settings = { ...DEFAULT_SETTINGS }
  private watcher: FSWatcher | null = null

  /** Load (creating the file with defaults if missing) — call once at startup */
  init(mainWindow: BrowserWindow): void {
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

  /** Merge a partial update and write atomically */
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
      // Malformed JSON (mid-edit) — keep the last good settings
      return this.settings
    }
  }

  private async writeToDisk(settings: Settings): Promise<void> {
    const tmp = `${this.file}.tmp`
    await fsp.writeFile(tmp, JSON.stringify(settings, null, 2), 'utf-8')
    await fsp.rename(tmp, this.file)
  }

  private startWatching(mainWindow: BrowserWindow): void {
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

  dispose(): void {
    this.watcher?.close()
    this.watcher = null
  }
}
