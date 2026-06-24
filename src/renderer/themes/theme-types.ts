/** 一个主题 = 基础明暗类型 + Monaco base + CSS 自定义属性映射 */
export interface ThemeDefinition {
  /** 设置中使用的稳定 id（workbench.colorTheme），如 "Dark+" */
  id: string
  label: string
  type: 'dark' | 'light'
  /** 配套使用的 Monaco 内置基础主题 */
  monacoBase: 'vs-dark' | 'vs'
  /** CSS 自定义属性（完整变量名 → 值），会应用到 :root */
  colors: Record<string, string>
}
