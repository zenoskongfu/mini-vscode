import { app } from 'electron'
import path from 'path'

/**
 * 应用路径分层（Phase 15 #9，依据 docs/packaged-paths-and-extensions.md）。
 *
 * 关键：生产态 `app.getAppPath()` 指向只读的 `app.asar`，不能往里写。
 * 因此把扩展路径分成「只读内置/市场」与「可写用户安装」两套：
 *   - galleryDir / builtinExtensionsDir：随产品发布，只读
 *     （dev=项目根；prod=Contents/Resources 下的 extraResources）
 *   - userExtensionsDir：用户安装扩展，可写（app.getPath('userData')/extensions）
 */

const appRoot = app.getAppPath()

export function getGalleryDir(): string {
  return app.isPackaged ? path.join(process.resourcesPath, 'gallery') : path.join(appRoot, 'gallery')
}

export function getBuiltinExtensionsDir(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'builtin-extensions')
    : path.join(appRoot, 'extensions')
}

export function getUserExtensionsDir(): string {
  return path.join(app.getPath('userData'), 'extensions')
}
