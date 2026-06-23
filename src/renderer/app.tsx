import React, { useState, useEffect } from 'react'
import { Workbench } from './workbench/Workbench'
import { ServicesProvider } from './platform/ServicesContext'
import { createInstantiationService } from './platform/bootstrap'
import { ILayoutService } from './services/layout/layoutService'
import { IWorkspaceService } from './services/workspace/workspaceService'
import { IKeybindingService } from './services/keybinding/keybindingService'
import { IConfigurationService } from './services/configuration/configurationService'
import { IThemeService } from './services/theme/themeService'
import { registerWorkbenchContributions } from './workbench/contrib/registerContributions'

/**
 * App root.
 *
 * Builds the DI container once, restores persisted state from the services,
 * then renders the Workbench inside the ServicesProvider so every component
 * can resolve services via useService().
 */
export default function App(): React.JSX.Element {
  const [instantiationService] = useState(() => {
    const insta = createInstantiationService()
    // Restore persisted layout + last opened folder
    insta.get(ILayoutService).restore()
    insta.get(IWorkspaceService).restore()
    // Register commands + default keybindings, and activate the keydown listener
    registerWorkbenchContributions(insta)
    insta.get(IKeybindingService)
    return insta
  })

  // Configuration is file-backed (async). First paint uses the dark defaults
  // already in globals.css; once config loads we initialize the theme, which
  // applies the persisted workbench.colorTheme.
  useEffect(() => {
    const config = instantiationService.get(IConfigurationService)
    config.initialize().then(() => {
      instantiationService.get(IThemeService).initialize()
    })
  }, [instantiationService])

  return (
    <ServicesProvider instantiationService={instantiationService}>
      <Workbench />
    </ServicesProvider>
  )
}
