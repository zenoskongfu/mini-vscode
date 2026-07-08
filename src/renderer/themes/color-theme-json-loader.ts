import type { ColorThemeData, ColorThemeSource, ThemeDefinition, ThemeTokenRule } from './theme-types'

export interface ColorThemeJsonLoadOptions {
  id: string
  label?: string
  source?: ColorThemeSource
  extensionId?: string
  baseTheme: ThemeDefinition
  json: unknown
}

interface ColorThemeJson {
  name?: string
  type?: 'dark' | 'light'
  colors?: Record<string, unknown>
  tokenColors?: unknown[]
  semanticHighlighting?: boolean
  semanticTokenColors?: Record<string, unknown>
}

interface TokenColorRuleJson {
  scope?: string | string[]
  settings?: {
    foreground?: unknown
    fontStyle?: unknown
  }
}

interface SemanticTokenStyleJson {
  foreground?: unknown
  fontStyle?: unknown
}

const VSCODE_COLOR_TO_CSS_VAR: Record<string, string> = {
  foreground: '--color-fg-default',
  disabledForeground: '--color-fg-disabled',
  errorForeground: '--color-error',
  focusBorder: '--color-border-focus',

  'activityBar.background': '--color-bg-activity-bar',
  'activityBar.foreground': '--color-fg-activity-bar-active',
  'activityBar.inactiveForeground': '--color-fg-activity-bar',
  'activityBar.activeBorder': '--color-fg-activity-bar-active',
  'activityBar.border': '--color-border',

  'button.background': '--color-accent',
  'button.hoverBackground': '--color-accent-hover',
  'button.foreground': '--color-fg-active',

  'dropdown.background': '--color-bg-dropdown',
  'dropdown.foreground': '--color-fg-default',
  'dropdown.border': '--color-border',

  'editor.background': '--color-bg-editor',
  'editor.foreground': '--color-fg-default',
  'editor.lineHighlightBackground': '--color-editor-line-highlight',
  'editor.selectionBackground': '--color-editor-selection',
  'editorCursor.foreground': '--color-editor-cursor',
  'editorLineNumber.foreground': '--color-editor-line-number',
  'editorLineNumber.activeForeground': '--color-editor-line-number-active',

  'editorGroupHeader.tabsBackground': '--color-tab-inactive-bg',
  'editorGroup.border': '--color-border',

  'input.background': '--color-bg-input',
  'input.foreground': '--color-fg-default',
  'input.border': '--color-border-focus',
  'input.placeholderForeground': '--color-fg-muted',

  'list.hoverBackground': '--color-bg-hover',
  'list.activeSelectionBackground': '--color-bg-selected',
  'list.activeSelectionForeground': '--color-fg-active',
  'list.inactiveSelectionBackground': '--color-bg-selected',
  'list.inactiveSelectionForeground': '--color-fg-default',

  'panel.background': '--color-bg-panel',
  'panel.border': '--color-border',
  'panelTitle.activeBorder': '--color-panel-tab-active-border',

  'sideBar.background': '--color-bg-sidebar',
  'sideBar.foreground': '--color-fg-default',
  'sideBar.border': '--color-border',
  'sideBarSectionHeader.foreground': '--color-fg-muted',

  'statusBar.background': '--color-bg-status-bar',
  'statusBar.foreground': '--color-fg-status-bar',

  'tab.activeBackground': '--color-tab-active-bg',
  'tab.activeForeground': '--color-fg-active',
  'tab.activeBorder': '--color-tab-active-border',
  'tab.inactiveBackground': '--color-tab-inactive-bg',
  'tab.inactiveForeground': '--color-tab-inactive-fg',
  'tab.border': '--color-border',

  'titleBar.activeBackground': '--color-bg-title-bar',
  'titleBar.activeForeground': '--color-fg-title-bar',
  'titleBar.inactiveForeground': '--color-fg-muted',
  'titleBar.border': '--color-border',

  'notificationToast.border': '--color-notification-border',
  'notifications.background': '--color-bg-notification',
  'notifications.foreground': '--color-fg-default',
  'notifications.border': '--color-border',

  'scrollbarSlider.background': '--color-scrollbar-thumb',
  'scrollbarSlider.hoverBackground': '--color-scrollbar-thumb-hover',
  'scrollbarSlider.activeBackground': '--color-scrollbar-thumb-hover',

  'gitDecoration.addedResourceForeground': '--color-git-added',
  'gitDecoration.modifiedResourceForeground': '--color-git-modified',
  'gitDecoration.deletedResourceForeground': '--color-git-deleted',
  'gitDecoration.untrackedResourceForeground': '--color-git-untracked',

  'problemsErrorIcon.foreground': '--color-error',
  'problemsWarningIcon.foreground': '--color-warning',
  'problemsInfoIcon.foreground': '--color-info'
}

export function loadColorThemeFromJson(options: ColorThemeJsonLoadOptions): ColorThemeData {
  const json = normalizeThemeJson(options.json, options.id)
  const themeType = normalizeThemeType(json.type, options.baseTheme.type, options.id)
  const semanticTokenColors = normalizeObjectField(json.semanticTokenColors, 'semanticTokenColors', options.id)
  const colors = {
    ...options.baseTheme.colors,
    ...mapWorkbenchColors(normalizeObjectField(json.colors, 'colors', options.id), options.id)
  }
  const tokenRules = [
    ...(options.baseTheme.tokenRules ?? []),
    ...mapTokenColors(normalizeArrayField(json.tokenColors, 'tokenColors', options.id), options.id),
    ...mapSemanticTokenColors(semanticTokenColors, options.id)
  ]

  return {
    id: options.id,
    label: options.label ?? json.name ?? options.id,
    type: themeType,
    monacoBase: themeType === 'dark' ? 'vs-dark' : 'vs',
    colors,
    tokenRules,
    semanticHighlighting: normalizeBooleanField(json.semanticHighlighting, 'semanticHighlighting', options.id),
    semanticTokenColors,
    source: options.source,
    extensionId: options.extensionId
  }
}

function normalizeThemeJson(json: unknown, themeId: string): ColorThemeJson {
  if (isObject(json)) return json as ColorThemeJson
  console.warn(`[ThemeJsonLoader] theme "${themeId}" is not an object; using base theme only.`)
  return {}
}

function normalizeThemeType(value: unknown, fallback: 'dark' | 'light', themeId: string): 'dark' | 'light' {
  if (value === undefined) return fallback
  if (value === 'dark' || value === 'light') return value
  console.warn(`[ThemeJsonLoader] type in theme "${themeId}" must be "dark" or "light"; using base theme type.`)
  return fallback
}

function normalizeObjectField(value: unknown, field: string, themeId: string): Record<string, unknown> {
  if (value === undefined) return {}
  if (isObject(value)) return value
  console.warn(`[ThemeJsonLoader] ${field} in theme "${themeId}" must be an object; ignoring it.`)
  return {}
}

function normalizeArrayField(value: unknown, field: string, themeId: string): unknown[] {
  if (value === undefined) return []
  if (Array.isArray(value)) return value
  console.warn(`[ThemeJsonLoader] ${field} in theme "${themeId}" must be an array; ignoring it.`)
  return []
}

function normalizeBooleanField(value: unknown, field: string, themeId: string): boolean | undefined {
  if (value === undefined) return undefined
  if (typeof value === 'boolean') return value
  console.warn(`[ThemeJsonLoader] ${field} in theme "${themeId}" must be a boolean; ignoring it.`)
  return undefined
}

function mapWorkbenchColors(colors: Record<string, unknown>, themeId: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [colorId, rawValue] of Object.entries(colors)) {
    const cssVar = VSCODE_COLOR_TO_CSS_VAR[colorId]
    if (!cssVar) {
      console.warn(`[ThemeJsonLoader] unknown color id "${colorId}" in theme "${themeId}".`)
      continue
    }
    if (typeof rawValue !== 'string') {
      console.warn(`[ThemeJsonLoader] color "${colorId}" in theme "${themeId}" must be a string.`)
      continue
    }
    result[cssVar] = rawValue
  }
  return result
}

function mapTokenColors(tokenColors: unknown[], themeId: string): ThemeTokenRule[] {
  const rules: ThemeTokenRule[] = []
  for (const entry of tokenColors) {
    if (!isObject(entry)) {
      console.warn(`[ThemeJsonLoader] tokenColors entry in theme "${themeId}" must be an object.`)
      continue
    }
    const rule = entry as TokenColorRuleJson
    const scopes = normalizeScopes(rule.scope)
    const foreground = typeof rule.settings?.foreground === 'string' ? rule.settings.foreground : undefined
    const fontStyle = typeof rule.settings?.fontStyle === 'string' ? rule.settings.fontStyle : undefined
    if (scopes.length === 0 || (!foreground && !fontStyle)) continue
    for (const scope of scopes) {
      rules.push({ token: scope, foreground, fontStyle })
    }
  }
  return rules
}

function mapSemanticTokenColors(semanticTokenColors: Record<string, unknown>, themeId: string): ThemeTokenRule[] {
  const rules: ThemeTokenRule[] = []
  for (const [token, value] of Object.entries(semanticTokenColors)) {
    if (typeof value === 'string') {
      rules.push({ token, foreground: value })
      continue
    }
    if (!isObject(value)) {
      console.warn(`[ThemeJsonLoader] semantic token "${token}" in theme "${themeId}" must be a string or object.`)
      continue
    }
    const style = value as SemanticTokenStyleJson
    const foreground = typeof style.foreground === 'string' ? style.foreground : undefined
    const fontStyle = typeof style.fontStyle === 'string' ? style.fontStyle : undefined
    if (foreground || fontStyle) rules.push({ token, foreground, fontStyle })
  }
  return rules
}

function normalizeScopes(scope: string | string[] | undefined): string[] {
  if (typeof scope === 'string') {
    return scope.split(',').map(s => s.trim()).filter(Boolean)
  }
  if (Array.isArray(scope)) {
    return scope.flatMap(s => normalizeScopes(s))
  }
  return []
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
