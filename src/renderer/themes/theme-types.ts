/** Monaco 语法/语义着色规则（token 可为 TextMate scope 或语义 token 类型） */
export interface ThemeTokenRule {
  token: string
  /** 前景色，带或不带 # 都可 */
  foreground?: string
  /** 'italic' | 'bold' | 'underline' 等 */
  fontStyle?: string
}

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
  /**
   * Monaco 编辑器的语法/语义着色规则。token 既匹配 TextMate scope
   * （keyword/string…），也匹配语义 token 类型（function/variable…），
   * 因此同时覆盖语法高亮与语义高亮。基于 base 主题 inherit，可只列覆盖项。
   */
  tokenRules?: ThemeTokenRule[]
}

export type ColorThemeSource = 'builtin' | 'extension'

/** 注册表中的颜色主题数据；先兼容现有 ThemeDefinition，后续可承载插件来源信息。 */
export interface ColorThemeData extends ThemeDefinition {
  source?: ColorThemeSource
  extensionId?: string
}
