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
    // 恢复持久化布局与上次打开的文件夹
    insta.get(ILayoutService).restore()
    insta.get(IWorkspaceService).restore()
    // 注册命令和默认快捷键，并激活 keydown 监听器
    registerWorkbenchContributions(insta)
    insta.get(IKeybindingService)
    return insta
  })

  // 配置由文件支撑（异步）。首屏先使用 globals.css 中已经存在的
  // 深色默认值；配置加载完成后再初始化主题，
  // 从而应用已持久化的 workbench.colorTheme。
  useEffect(() => {
    const config = instantiationService.get(IConfigurationService)
    config.initialize().then(() => {
      instantiationService.get(IThemeService).initialize()
    })
    // 连接扩展宿主（浏览器预览中不会收到端口，因此是 no-op）
    instantiationService.get(IExtensionService).start()
  }, [instantiationService])

  return (
    <ServicesProvider instantiationService={instantiationService}>
      <Workbench />
    </ServicesProvider>
  )
}
