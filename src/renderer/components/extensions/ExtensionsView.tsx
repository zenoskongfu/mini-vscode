import React, { useState } from 'react'
import { useService } from '../../platform/ServicesContext'
import { useEvent } from '../../platform/useEvent'
import { IExtensionService, type ExtensionViewModel } from '../../services/extensions/extensionService'
import { fuzzyMatch } from '../../base/fuzzy'
import './ExtensionsView.css'

/**
 * Extensions 侧边栏视图：VSCode Extensions 面板的简化版。
 * 展示本地 “gallery” 与已安装/已启用状态的合并结果，
 * 并支持搜索、安装、卸载、启用和禁用。
 */
export function ExtensionsView(): React.JSX.Element {
  const extensionService = useService(IExtensionService)
  const items = useEvent(
    extensionService.onDidChangeExtensions,
    () => extensionService.getViewModels()
  )
  const [query, setQuery] = useState('')

  const filtered = query
    ? items
        .map(item => ({ item, m: fuzzyMatch(query, `${item.displayName} ${item.publisher}`) }))
        .filter(x => x.m !== null)
        .sort((a, b) => (b.m!.score - a.m!.score))
        .map(x => x.item)
    : items

  return (
    <div className="extensions-view">
      <div className="extensions-view__search">
        <input
          className="extensions-view__input"
          placeholder="Search Extensions in Marketplace"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
      </div>
      <div className="extensions-view__list">
        {filtered.length === 0 && (
          <div className="extensions-view__empty">No extensions found</div>
        )}
        {filtered.map(item => (
          <ExtensionItem key={item.id} item={item} service={extensionService} />
        ))}
      </div>
    </div>
  )
}

function ExtensionItem({
  item,
  service
}: {
  item: ExtensionViewModel
  service: IExtensionService
}): React.JSX.Element {
  const [busy, setBusy] = useState(false)

  const run = async (fn: () => Promise<void>): Promise<void> => {
    setBusy(true)
    try {
      await fn()
    } finally {
      setBusy(false)
    }
  }

  // 状态化的中间态：操作进行中禁用按钮，徽标反映激活/失败
  const pending =
    busy ||
    item.status === 'installing' ||
    item.status === 'uninstalling' ||
    item.status === 'activating'

  const badge = (): { text: string; cls: string } => {
    switch (item.status) {
      case 'activating':
        return { text: 'Activating…', cls: 'extension-item__badge--on' }
      case 'active':
        return { text: 'Active', cls: 'extension-item__badge--on' }
      case 'failed':
        return { text: 'Failed', cls: 'extension-item__badge--off' }
      default:
        return item.enabled
          ? { text: 'Installed', cls: 'extension-item__badge--on' }
          : { text: 'Disabled', cls: 'extension-item__badge--off' }
    }
  }
  const b = badge()

  return (
    <div className={`extension-item ${!item.enabled && item.installed ? 'extension-item--disabled' : ''}`}>
      <div className="extension-item__icon">{item.displayName.charAt(0).toUpperCase()}</div>
      <div className="extension-item__body">
        <div className="extension-item__row">
          <span className="extension-item__name" title={item.displayName}>{item.displayName}</span>
          <span className="extension-item__version">v{item.version}</span>
        </div>
        <div className="extension-item__desc" title={item.description}>{item.description}</div>
        <div className="extension-item__row extension-item__footer">
          <div className="extension-item__meta">
            <span className="extension-item__publisher">{item.publisher}</span>
            {item.installed && (
              <span className={`extension-item__badge ${b.cls}`}>{b.text}</span>
            )}
          </div>
          <div className="extension-item__actions">
            {!item.installed ? (
              <button className="extension-item__btn extension-item__btn--primary" disabled={pending}
                onClick={() => run(() => service.install(item.id))}>
                {item.status === 'installing' ? 'Installing…' : 'Install'}
              </button>
            ) : (
              <>
                <button className="extension-item__btn" disabled={pending}
                  onClick={() => run(() => service.setEnabled(item.id, !item.enabled))}>
                  {item.enabled ? 'Disable' : 'Enable'}
                </button>
                <button className="extension-item__btn" disabled={pending}
                  onClick={() => run(() => service.uninstall(item.id))}>
                  {item.status === 'uninstalling' ? 'Uninstalling…' : 'Uninstall'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
