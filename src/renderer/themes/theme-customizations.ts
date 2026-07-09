import { mapTokenColors, mapWorkbenchColors } from './color-theme-json-loader'
import type { ThemeTokenRule } from './theme-types'

export interface ThemeCustomizations {
  colors: Record<string, string>
  tokenRules: ThemeTokenRule[]
}

const TOKEN_COLOR_CUSTOMIZATION_SCOPES: Record<string, string[]> = {
  comments: ['comment'],
  strings: ['string'],
  keywords: ['keyword'],
  numbers: ['number'],
  functions: ['function'],
  variables: ['variable'],
  types: ['type', 'class', 'interface', 'enum']
}

export function resolveThemeCustomizations(
  workbenchColorCustomizations: unknown,
  editorTokenColorCustomizations: unknown,
  themeId: string
): ThemeCustomizations {
  return {
    colors: mapWorkbenchColors(resolveScopedObject(workbenchColorCustomizations, themeId), `settings:${themeId}`),
    tokenRules: resolveTokenColorCustomizations(editorTokenColorCustomizations, themeId)
  }
}

function resolveScopedObject(value: unknown, themeId: string): Record<string, unknown> {
  if (!isObject(value)) return {}

  const scopedKey = `[${themeId}]`
  const result: Record<string, unknown> = {}
  for (const [key, raw] of Object.entries(value)) {
    if (isThemeScopedKey(key)) continue
    result[key] = raw
  }

  const scoped = value[scopedKey]
  if (isObject(scoped)) {
    Object.assign(result, scoped)
  }

  return result
}

function resolveTokenColorCustomizations(value: unknown, themeId: string): ThemeTokenRule[] {
  const customizations = resolveScopedObject(value, themeId)
  const rules: ThemeTokenRule[] = []

  for (const [key, scopes] of Object.entries(TOKEN_COLOR_CUSTOMIZATION_SCOPES)) {
    const raw = customizations[key]
    if (typeof raw !== 'string') continue
    for (const scope of scopes) {
      rules.push({ token: scope, foreground: raw })
    }
  }

  const textMateRules = customizations.textMateRules
  if (Array.isArray(textMateRules)) {
    rules.push(...mapTokenColors(textMateRules, `settings:${themeId}`))
  }

  return rules
}

function isThemeScopedKey(key: string): boolean {
  return key.startsWith('[') && key.endsWith(']')
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
