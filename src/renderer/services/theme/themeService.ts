import { createDecorator } from '../../instantiation/instantiation'
import { registerSingleton } from '../../instantiation/extensions'
import { Emitter, Event } from '../../base/event'
import { IConfigurationService } from '../configuration/configurationService'
import type { ColorThemeData } from '../../themes/theme-types'
import { darkPlus } from '../../themes/dark-plus'
import { lightPlus } from '../../themes/light-plus'
import { monaco, monacoThemeName } from '../monaco-setup'

const THEME_SETTING = 'workbench.colorTheme'
const DEFAULT_COLOR_THEME_ID = darkPlus.id

const BUILTIN_COLOR_THEMES: ColorThemeData[] = [
  { ...darkPlus, source: 'builtin' },
  { ...lightPlus, source: 'builtin' }
]

export interface IThemeService {
  readonly _serviceBrand: undefined

  readonly onDidChangeTheme: Event<ColorThemeData>
  readonly current: ColorThemeData

  /** 当前已注册的颜色主题（内置 + 后续插件贡献），供主题选择器使用 */
  getColorThemes(): ColorThemeData[]
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

  private readonly _colorThemes = new Map<string, ColorThemeData>()
  private _current: ColorThemeData = BUILTIN_COLOR_THEMES[0]
  private _initialized = false

  private readonly _onDidChangeTheme = new Emitter<ColorThemeData>()
  readonly onDidChangeTheme = this._onDidChangeTheme.event

  constructor(@IConfigurationService private readonly configurationService: IConfigurationService) {
    for (const theme of BUILTIN_COLOR_THEMES) {
      this.registerColorTheme(theme)
    }
    this._current = this.getFallbackTheme()
  }

  get current(): ColorThemeData {
    return this._current
  }

  getColorThemes(): ColorThemeData[] {
    return [...this._colorThemes.values()].sort((a, b) => a.label.localeCompare(b.label))
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
    const id = this.configurationService.getValue<string>(THEME_SETTING, DEFAULT_COLOR_THEME_ID)
    if (id !== this._current.id) this.applyTheme(id)
  }

  applyTheme(id: string): void {
    const theme = this._colorThemes.get(id) ?? this.getFallbackTheme()
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

  private registerColorTheme(theme: ColorThemeData): void {
    this._colorThemes.set(theme.id, theme)
  }

  private getFallbackTheme(): ColorThemeData {
    return this._colorThemes.get(DEFAULT_COLOR_THEME_ID) ?? BUILTIN_COLOR_THEMES[0]
  }
}

registerSingleton(IThemeService, ThemeService)
