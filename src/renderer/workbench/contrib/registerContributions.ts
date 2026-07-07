import { IInstantiationService } from '../../instantiation/instantiation'
import { ICommandService } from '../../services/commands/commandService'
import { IKeybindingService } from '../../services/keybinding/keybindingService'
import { IQuickInputService } from '../../services/quickinput/quickInputService'
import { ILayoutService, type ActivityView } from '../../services/layout/layoutService'
import { IWorkspaceService } from '../../services/workspace/workspaceService'
import { IEditorService } from '../../services/editor/editorService'
import { ITerminalService } from '../../services/terminal/terminalService'
import { IConfigurationService } from '../../services/configuration/configurationService'
import { IThemeService } from '../../services/theme/themeService'
import { IDebugService } from '../../services/debug/debugService'

/**
 * 注册内置命令及其默认快捷键。
 *
 * 启动时用根容器调用一次。命令处理器从容器中解析自己要操作的服务，
 * 保持 wiring 与 DI 一致（VSCode 的 workbench contributions 也采用类似方式）。
 */
export function registerWorkbenchContributions(insta: IInstantiationService): void {
  const commandService = insta.get(ICommandService)
  const keybindingService = insta.get(IKeybindingService)
  const quickInputService = insta.get(IQuickInputService)
  const layoutService = insta.get(ILayoutService)
  const workspaceService = insta.get(IWorkspaceService)
  const editorService = insta.get(IEditorService)
  const terminalService = insta.get(ITerminalService)
  const configurationService = insta.get(IConfigurationService)
  const themeService = insta.get(IThemeService)
  const debugService = insta.get(IDebugService)

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

  // ── 命令面板 ──
  register(
    'workbench.action.showCommands',
    'Show All Commands',
    undefined,
    () => quickInputService.toggle(),
    'mod+shift+p'
  )

  // ── 视图切换 ──
  const showView = (view: ActivityView) => () => {
    layoutService.setActiveView(view)
    layoutService.setSidebarVisible(true)
  }
  register('workbench.view.explorer', 'Show Explorer', 'View', showView('explorer'), 'mod+shift+e')
  register('workbench.view.search', 'Show Search', 'View', showView('search'), 'mod+shift+f')
  register('workbench.view.scm', 'Show Source Control', 'View', showView('scm'), 'mod+shift+g')
  register('workbench.view.debug', 'Show Run and Debug', 'View', showView('debug'), 'mod+shift+d')
  register('workbench.view.extensions', 'Show Extensions', 'View', showView('extensions'), 'mod+shift+x')

  // ── 布局切换 ──
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

  // ── 文件 ──
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

  // ── 终端 ──
  // 注意：我们的快捷键体系把 Ctrl/Cmd 标准化为 "mod"，因此这里在
  // macOS 上是 Cmd+`（VSCode 全平台使用 Ctrl+`；这里是刻意简化）。
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

  // ── 调试（Phase 14）──
  register(
    'workbench.action.debug.startOrContinue',
    'Start / Continue Debugging',
    'Debug',
    () => {
      if (debugService.status === 'inactive') {
        layoutService.setActiveView('debug')
        layoutService.setSidebarVisible(true)
        void debugService.start()
      } else if (debugService.status === 'stopped') {
        void debugService.continue()
      }
    },
    'f5'
  )
  register('workbench.action.debug.stepOver', 'Step Over', 'Debug', () => void debugService.next(), 'f10')
  register('workbench.action.debug.stepInto', 'Step Into', 'Debug', () => void debugService.stepIn(), 'f11')
  register('workbench.action.debug.stop', 'Stop Debugging', 'Debug', () => void debugService.stop(), 'shift+f5')

  // ── 偏好设置 ──
  register(
    'workbench.action.openSettingsJson',
    'Open Settings (JSON)',
    'Preferences',
    async () => {
      const path = await configurationService.getSettingsPath()
      editorService.openEditor(path)
    },
    'mod+,'
  )
  register(
    'workbench.action.selectTheme',
    'Color Theme',
    'Preferences',
    async () => {
      const selected = await quickInputService.pick(
        themeService.getColorThemes().map(theme => ({
          id: theme.id,
          label: theme.label,
          description: theme.id === themeService.current.id ? 'Current' : theme.type === 'dark' ? 'Dark' : 'Light',
          value: theme.id
        })),
        {
          title: 'Preferences: Color Theme',
          placeholder: 'Select Color Theme'
        }
      )
      if (selected) await configurationService.updateValue('workbench.colorTheme', selected.value)
    }
  )
}
