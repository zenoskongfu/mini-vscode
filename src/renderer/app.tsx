import React, { useState } from 'react'
import { Workbench } from './workbench/Workbench'
import { ServicesProvider } from './platform/ServicesContext'
import { createInstantiationService } from './platform/bootstrap'
import { ILayoutService } from './services/layout/layoutService'
import { IWorkspaceService } from './services/workspace/workspaceService'

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
    return insta
  })

  return (
    <ServicesProvider instantiationService={instantiationService}>
      <Workbench />
    </ServicesProvider>
  )
}
