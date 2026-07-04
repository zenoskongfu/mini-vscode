import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { getGalleryDir, getUserExtensionsDir } from '../paths'

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
 * - “市场”是只读的 gallery/ 目录（dev=项目根，prod=Resources）。
 * - 安装时复制 gallery/<id> → userExtensions/<id>（可写，位于 userData）。
 * - 卸载时删除 userExtensions/<id>。
 *   生产态绝不能写 app.getAppPath()（= 只读 app.asar）——见 docs/packaged-paths-and-extensions.md。
 */
export class ExtensionManagementService {
  private readonly galleryDir = getGalleryDir()
  private readonly userExtensionsDir = getUserExtensionsDir()

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
    const to = path.join(this.userExtensionsDir, id)
    if (!fs.existsSync(from)) throw new Error(`[ext] gallery item not found: ${id}`)
    await fsp.mkdir(this.userExtensionsDir, { recursive: true })
    await fsp.cp(from, to, { recursive: true })
  }

  async uninstall(id: string): Promise<void> {
    const target = path.join(this.userExtensionsDir, id)
    await fsp.rm(target, { recursive: true, force: true })
  }
}
