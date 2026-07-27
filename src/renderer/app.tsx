import React, { useState, useEffect } from 'react'
import { Workbench } from './workbench/Workbench'
import { ServicesProvider } from './platform/ServicesContext'
import { createInstantiationService } from './platform/bootstrap'
import { ILayoutService } from './services/layout/layoutService'
import { IWorkspaceService } from './services/workspace/workspaceService'
import { IKeybindingService } from './services/keybinding/keybindingService'
import { IConfigurationService } from './services/configuration/configurationService'
import { IThemeService } from './services/theme/themeService'
import { IExtensionService } from './services/extensions/extensionService'
import { registerWorkbenchContributions } from './workbench/contrib/registerContributions'

/**
 * App 根组件。
 *
 * 只创建一次 DI 容器，从服务中恢复持久化状态，
 * 然后把 Workbench 渲染到 ServicesProvider 内，让所有组件都能通过 useService() 解析服务。
 */
export default function App(): React.JSX.Element {
  const [instantiationService] = useState(() => {
    const insta = createInstantiationService()
    // 主题服务必须在 Workbench 首次绘制前 eager 创建：
    // 构造阶段会同步恢复上次成功应用的主题快照。
    insta.get(IThemeService)
    // 恢复持久化布局（同步，来自 localStorage）
    insta.get(ILayoutService).restore()
    // 注册命令和默认快捷键，并激活 keydown 监听器
    registerWorkbenchContributions(insta)
    insta.get(IKeybindingService)
    return insta
  })

  // 首屏主题已由 ThemeService 同步恢复。配置与静态扩展主题异步并行加载：
  // 配置到达后先应用已知主题，扩展主题注册完成后再做一次最终校正。
  useEffect(() => {
    const config = instantiationService.get(IConfigurationService)
    const themeService = instantiationService.get(IThemeService)
    const extensionService = instantiationService.get(IExtensionService)

    const configReady = config.initialize()
      .then(() => themeService.initialize())
      .catch(error => {
        console.error('[renderer] failed to initialize configuration:', error)
        themeService.initialize()
      })
    const extensionThemesReady = extensionService.start()
      .catch(error => {
        console.error('[renderer] failed to initialize extensions:', error)
      })
    void Promise.allSettled([configReady, extensionThemesReady])
      .then(() => themeService.completeStartup())

    // 异步恢复上次打开的文件夹（来自主进程 state.json）
    instantiationService.get(IWorkspaceService).restore()
  }, [instantiationService])

  return (
    <ServicesProvider instantiationService={instantiationService}>
      <Workbench />
    </ServicesProvider>
  )
}
