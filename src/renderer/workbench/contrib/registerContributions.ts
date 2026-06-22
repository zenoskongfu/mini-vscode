import { IInstantiationService } from '../../instantiation/instantiation'
import { ICommandService } from '../../services/commands/commandService'
import { IKeybindingService } from '../../services/keybinding/keybindingService'
import { IQuickInputService } from '../../services/quickinput/quickInputService'
import { ILayoutService, type ActivityView } from '../../services/layout/layoutService'
import { IWorkspaceService } from '../../services/workspace/workspaceService'
import { IEditorService } from '../../services/editor/editorService'
import { ITerminalService } from '../../services/terminal/terminalService'

/**
 * Register the built-in commands + their default keybindings.
 *
 * Called once at startup with the root container. Command handlers resolve the
 * services they act on from the container — keeping the wiring DI-consistent
 * (VSCode does the analogous thing in its workbench contributions).
 */
export function registerWorkbenchContributions(insta: IInstantiationService): void {
  const commandService = insta.get(ICommandService)
  const keybindingService = insta.get(IKeybindingService)
  const quickInputService = insta.get(IQuickInputService)
  const layoutService = insta.get(ILayoutService)
  const workspaceService = insta.get(IWorkspaceService)
  const editorService = insta.get(IEditorService)
  const terminalService = insta.get(ITerminalService)

  const register = (
    id: string,
    title: string,
    category: string | undefined,
    handler: () => void,
    chord?: string
  ): void => {
    commandService.registerCommand({ id, title, category, handler })
    if (chord) keybindingService.registerKeybinding(chord, id)
  }

  // ── Command Palette ──
  register(
    'workbench.action.showCommands',
    'Show All Commands',
    undefined,
    () => quickInputService.toggle(),
    'mod+shift+p'
  )

  // ── View switching ──
  const showView = (view: ActivityView) => () => {
    layoutService.setActiveView(view)
    layoutService.setSidebarVisible(true)
  }
  register('workbench.view.explorer', 'Show Explorer', 'View', showView('explorer'), 'mod+shift+e')
  register('workbench.view.search', 'Show Search', 'View', showView('search'), 'mod+shift+f')
  register('workbench.view.scm', 'Show Source Control', 'View', showView('scm'), 'mod+shift+g')
  register('workbench.view.extensions', 'Show Extensions', 'View', showView('extensions'), 'mod+shift+x')

  // ── Layout toggles ──
  register(
    'workbench.action.toggleSidebarVisibility',
    'Toggle Primary Side Bar Visibility',
    'View',
    () => layoutService.toggleSidebar(),
    'mod+b'
  )
  register(
    'workbench.action.togglePanel',
    'Toggle Panel Visibility',
    'View',
    () => layoutService.togglePanel(),
    'mod+j'
  )

  // ── Files ──
  register(
    'workbench.action.files.openFolder',
    'Open Folder…',
    'File',
    () => workspaceService.openFolder(),
    'mod+o'
  )
  register(
    'workbench.action.files.save',
    'Save',
    'File',
    () => { if (editorService.activePath) editorService.save(editorService.activePath) },
    'mod+s'
  )
  register(
    'workbench.action.closeActiveEditor',
    'Close Editor',
    'View',
    () => { if (editorService.activePath) editorService.close(editorService.activePath) },
    'mod+w'
  )
  register(
    'workbench.action.closeFolder',
    'Close Folder',
    'File',
    () => workspaceService.closeFolder()
  )

  // ── Terminal ──
  // Note: our keybinding scheme normalizes Ctrl/Cmd to "mod", so this is
  // Cmd+` on macOS (VSCode uses Ctrl+` on all platforms — a deliberate simplification).
  register(
    'workbench.action.terminal.toggle',
    'Toggle Terminal',
    'Terminal',
    () => {
      if (layoutService.panelVisible) {
        layoutService.setPanelVisible(false)
      } else {
        layoutService.setPanelVisible(true)
        if (terminalService.terminals.length === 0) terminalService.createTerminal()
      }
    },
    'mod+`'
  )
  register(
    'workbench.action.terminal.new',
    'Create New Terminal',
    'Terminal',
    () => {
      layoutService.setPanelVisible(true)
      terminalService.createTerminal()
    }
  )
  register(
    'workbench.action.terminal.kill',
    'Kill the Active Terminal',
    'Terminal',
    () => {
      if (terminalService.activeId) terminalService.closeTerminal(terminalService.activeId)
    }
  )
}
