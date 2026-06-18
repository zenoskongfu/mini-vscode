import React from 'react'
import { Workbench } from './workbench/Workbench'

/**
 * App root — in later phases this will wrap Workbench with:
 * - ThemeProvider (injects CSS variables based on active theme)
 * - WorkspaceProvider (active folder path)
 */
export default function App(): React.JSX.Element {
  return <Workbench />
}
