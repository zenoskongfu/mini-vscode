import type { ThemeDefinition } from './theme-types'

/** VS Dark+：对应原先硬编码在 globals.css 中的配色 */
export const darkPlus: ThemeDefinition = {
  id: 'Dark+',
  label: 'Dark+ (default dark)',
  type: 'dark',
  monacoBase: 'vs-dark',
  colors: {
    '--color-bg-workbench': '#1e1e1e',
    '--color-bg-sidebar': '#252526',
    '--color-bg-editor': '#1e1e1e',
    '--color-bg-panel': '#1e1e1e',
    '--color-bg-activity-bar': '#333333',
    '--color-bg-title-bar': '#3c3c3c',
    '--color-bg-status-bar': '#007acc',
    '--color-bg-input': '#3c3c3c',
    '--color-bg-dropdown': '#252526',
    '--color-bg-hover': '#2a2d2e',
    '--color-bg-active': '#37373d',
    '--color-bg-selected': '#094771',

    '--color-fg-default': '#cccccc',
    '--color-fg-muted': '#858585',
    '--color-fg-active': '#ffffff',
    '--color-fg-disabled': '#5a5a5a',
    '--color-fg-activity-bar': '#858585',
    '--color-fg-activity-bar-active': '#ffffff',
    '--color-fg-status-bar': '#ffffff',
    '--color-fg-title-bar': '#cccccc',

    '--color-border': '#454545',
    '--color-border-focus': '#007fd4',

    '--color-accent': '#007acc',
    '--color-accent-hover': '#0062a3',

    '--color-editor-line-highlight': '#282828',
    '--color-editor-selection': '#264f78',
    '--color-editor-cursor': '#aeafad',
    '--color-editor-line-number': '#858585',
    '--color-editor-line-number-active': '#c6c6c6',

    '--color-tab-active-bg': '#1e1e1e',
    '--color-tab-active-border': '#007acc',
    '--color-tab-inactive-bg': '#2d2d2d',
    '--color-tab-inactive-fg': '#858585',
    '--color-panel-tab-active-border': '#007acc',

    '--color-git-added': '#81b88b',
    '--color-git-modified': '#e2c08d',
    '--color-git-deleted': '#c74e39',
    '--color-git-untracked': '#73c991',

    '--color-error': '#f48771',
    '--color-warning': '#cca700',
    '--color-info': '#75beff',

    '--color-bg-notification': '#252526',
    '--color-notification-border': '#007acc',

    '--color-scrollbar-thumb': '#424242',
    '--color-scrollbar-thumb-hover': '#686868'
  }
}
