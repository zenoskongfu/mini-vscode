import { createDecorator } from '../../instantiation/instantiation'
import { registerSingleton } from '../../instantiation/extensions'
import { Emitter, Event } from '../../base/event'
import { IConfigurationService } from '../configuration/configurationService'
import type { ThemeDefinition } from '../../themes/theme-types'
import { darkPlus } from '../../themes/dark-plus'
import { lightPlus } from '../../themes/light-plus'

const THEME_SETTING = 'workbench.colorTheme'

export interface IThemeService {
  readonly _serviceBrand: undefined

  readonly onDidChangeTheme: Event<ThemeDefinition>
  readonly current: ThemeDefinition

  /** Apply theme by id (e.g. "Dark+"); persists nothing — callers update config */
  applyTheme(id: string): void
  /** Load theme from config + subscribe to config changes — call once at startup */
  initialize(): void
  getMonacoBase(): 'vs-dark' | 'vs'
}

export const IThemeService = createDecorator<IThemeService>('themeService')

/**
 * ThemeService — injects a theme's CSS custom properties onto :root and keeps
 * Monaco's editor theme in sync. Mirrors VSCode's IThemeService: the active
 * theme is driven by the `workbench.colorTheme` configuration value.
 */
export class ThemeService implements IThemeService {
  declare readonly _serviceBrand: undefined

  private readonly _themes = new Map<string, ThemeDefinition>([
    [darkPlus.id, darkPlus],
    [lightPlus.id, lightPlus]
  ])
  private _current: ThemeDefinition = darkPlus
  private _initialized = false

  private readonly _onDidChangeTheme = new Emitter<ThemeDefinition>()
  readonly onDidChangeTheme = this._onDidChangeTheme.event

  constructor(@IConfigurationService private readonly configurationService: IConfigurationService) {}

  get current(): ThemeDefinition {
    return this._current
  }

  getMonacoBase(): 'vs-dark' | 'vs' {
    return this._current.monacoBase
  }

  initialize(): void {
    this.applyFromConfig()
    if (this._initialized) return
    this._initialized = true
    // Re-apply when settings.json changes the theme
    this.configurationService.onDidChangeConfiguration(() => this.applyFromConfig())
  }

  private applyFromConfig(): void {
    const id = this.configurationService.getValue<string>(THEME_SETTING, darkPlus.id)
    if (id !== this._current.id) this.applyTheme(id)
  }

  applyTheme(id: string): void {
    const theme = this._themes.get(id) ?? darkPlus
    this._current = theme

    // 1. CSS custom properties → :root
    const root = document.documentElement
    for (const [name, value] of Object.entries(theme.colors)) {
      root.style.setProperty(name, value)
    }
    // native form controls / scrollbars follow the theme kind
    root.style.colorScheme = theme.type
    root.setAttribute('data-theme', theme.type)

    // 2. Monaco editor theme (best-effort; global is set by setupMonaco)
    const monaco = (globalThis as Record<string, unknown>).__monaco as
      | { editor: { setTheme: (t: string) => void } }
      | undefined
    monaco?.editor.setTheme(theme.monacoBase)

    this._onDidChangeTheme.fire(theme)
  }
}

registerSingleton(IThemeService, ThemeService)
