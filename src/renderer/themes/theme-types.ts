/** A theme = a base kind + Monaco base + a map of CSS custom properties */
export interface ThemeDefinition {
  /** Stable id used in settings (workbench.colorTheme), e.g. "Dark+" */
  id: string
  label: string
  type: 'dark' | 'light'
  /** Monaco built-in base theme to pair with */
  monacoBase: 'vs-dark' | 'vs'
  /** CSS custom properties (full var name → value), applied to :root */
  colors: Record<string, string>
}
