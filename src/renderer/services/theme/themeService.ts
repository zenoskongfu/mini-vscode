import { createDecorator } from '../../instantiation/instantiation'
import { registerSingleton } from '../../instantiation/extensions'
import { Emitter, Event } from '../../base/event'
import { IConfigurationService } from '../configuration/configurationService'
import type { ThemeDefinition } from '../../themes/theme-types'
import { darkPlus } from '../../themes/dark-plus'
import { lightPlus } from '../../themes/light-plus'
import { monaco, monacoThemeName } from '../monaco-setup'

const THEME_SETTING = 'workbench.colorTheme'

export interface IThemeService {
  readonly _serviceBrand: undefined

  readonly onDidChangeTheme: Event<ThemeDefinition>
  readonly current: ThemeDefinition

  /** 按 id 应用主题（如 "Dark+"）；本方法不持久化，由调用方更新配置 */
  applyTheme(id: string): void
  /** 从配置加载主题并订阅配置变化；启动时调用一次 */
  initialize(): void
  getMonacoBase(): 'vs-dark' | 'vs'
  /** 当前主题对应的 Monaco 自定义主题名（供 <Editor theme=…> 用） */
  getMonacoThemeName(): string
}

export const IThemeService = createDecorator<IThemeService>('themeService')

/**
 * ThemeService 把主题的 CSS 自定义属性注入到 :root，
 * 并保持 Monaco 编辑器主题同步。它对应 VSCode 的 IThemeService：
 * 当前主题由 `workbench.colorTheme` 配置值驱动。
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

  getMonacoThemeName(): string {
    return monacoThemeName(this._current.id)
  }

  initialize(): void {
    this.applyFromConfig()
    if (this._initialized) return
    this._initialized = true
    // settings.json 修改主题后重新应用
    this.configurationService.onDidChangeConfiguration(() => this.applyFromConfig())
  }

  private applyFromConfig(): void {
    const id = this.configurationService.getValue<string>(THEME_SETTING, darkPlus.id)
    if (id !== this._current.id) this.applyTheme(id)
  }

  applyTheme(id: string): void {
    const theme = this._themes.get(id) ?? darkPlus
    this._current = theme

    // 1. CSS 自定义属性 → :root
    const root = document.documentElement
    for (const [name, value] of Object.entries(theme.colors)) {
      root.style.setProperty(name, value)
    }
    // 原生表单控件/滚动条跟随主题类型
    root.style.colorScheme = theme.type
    root.setAttribute('data-theme', theme.type)

    // 2. Monaco 编辑器主题：切到该主题的自定义 Monaco 主题（含语法/语义着色）。
    //    主题已在 setupMonaco() 启动时 defineTheme 过，这里只需 setTheme。
    monaco.editor.setTheme(monacoThemeName(theme.id))

    this._onDidChangeTheme.fire(theme)
  }
}

registerSingleton(IThemeService, ThemeService)
