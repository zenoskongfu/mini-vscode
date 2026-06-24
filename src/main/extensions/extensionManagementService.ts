import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { app } from 'electron'

export interface GalleryItem {
  id: string
  displayName: string
  description: string
  publisher: string
  version: string
}

/**
 * ExtensionManagementService（main）负责扩展安装/卸载中的文件系统部分，
 * 对应 VSCode 的 IExtensionManagementService。
 *
 * - “市场”是本地的 gallery/ 目录，里面放着可安装扩展。
 * - 安装时复制 gallery/<id> → extensions/<id>（类似解包 VSIX）。
 * - 卸载时删除 extensions/<id>。
 */
export class ExtensionManagementService {
  private readonly galleryDir = path.join(app.getAppPath(), 'gallery')
  private readonly extensionsDir = path.join(app.getAppPath(), 'extensions')

  listGallery(): GalleryItem[] {
    const items: GalleryItem[] = []
    let names: string[] = []
    try {
      names = fs.readdirSync(this.galleryDir)
    } catch {
      return items
    }
    for (const name of names) {
      const manifestPath = path.join(this.galleryDir, name, 'package.json')
      if (!fs.existsSync(manifestPath)) continue
      try {
        const m = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
        items.push({
          id: m.name,
          displayName: m.displayName ?? m.name,
          description: m.description ?? '',
          publisher: m.publisher ?? 'unknown',
          version: m.version ?? '0.0.0'
        })
      } catch {
        // 跳过格式错误的 manifest
      }
    }
    return items
  }

  async install(id: string): Promise<void> {
    const from = path.join(this.galleryDir, id)
    const to = path.join(this.extensionsDir, id)
    if (!fs.existsSync(from)) throw new Error(`[ext] gallery item not found: ${id}`)
    await fsp.mkdir(this.extensionsDir, { recursive: true })
    await fsp.cp(from, to, { recursive: true })
  }

  async uninstall(id: string): Promise<void> {
    const target = path.join(this.extensionsDir, id)
    await fsp.rm(target, { recursive: true, force: true })
  }
}
