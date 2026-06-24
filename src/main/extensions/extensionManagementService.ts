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
 * ExtensionManagementService (main) — the file-system side of extension
 * install/uninstall, VSCode's IExtensionManagementService analog.
 *
 * - The "marketplace" is a local `gallery/` dir of ready-to-install extensions.
 * - Installing copies `gallery/<id>` → `extensions/<id>` (like unpacking a VSIX).
 * - Uninstalling removes `extensions/<id>`.
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
        // skip malformed manifest
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
