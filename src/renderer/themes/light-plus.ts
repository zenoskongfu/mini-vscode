import type { ThemeDefinition } from './theme-types'

/** VS Light+：近似 VSCode 默认浅色主题 */
export const lightPlus: ThemeDefinition = {
  id: 'Light+',
  label: 'Light+ (default light)',
  type: 'light',
  monacoBase: 'vs',
  colors: {
    '--color-bg-workbench': '#ffffff',
    '--color-bg-sidebar': '#f3f3f3',
    '--color-bg-editor': '#ffffff',
    '--color-bg-panel': '#ffffff',
    '--color-bg-activity-bar': '#2c2c2c',
    '--color-bg-title-bar': '#dddddd',
    '--color-bg-status-bar': '#007acc',
    '--color-bg-input': '#ffffff',
    '--color-bg-dropdown': '#ffffff',
    '--color-bg-hover': '#e8e8e8',
    '--color-bg-active': '#e4e6f1',
    '--color-bg-selected': '#d6ebff',

    '--color-fg-default': '#333333',
    '--color-fg-muted': '#6e6e6e',
    '--color-fg-active': '#000000',
    '--color-fg-disabled': '#bbbbbb',
    '--color-fg-activity-bar': '#cccccc',
    '--color-fg-activity-bar-active': '#ffffff',
    '--color-fg-status-bar': '#ffffff',
    '--color-fg-title-bar': '#333333',

    '--color-border': '#e7e7e7',
    '--color-border-focus': '#0090f1',

    '--color-accent': '#007acc',
    '--color-accent-hover': '#0062a3',

    '--color-editor-line-highlight': '#f3f3f3',
    '--color-editor-selection': '#add6ff',
    '--color-editor-cursor': '#000000',
    '--color-editor-line-number': '#237893',
    '--color-editor-line-number-active': '#0b216f',

    '--color-tab-active-bg': '#ffffff',
    '--color-tab-active-border': '#007acc',
    '--color-tab-inactive-bg': '#ececec',
    '--color-tab-inactive-fg': '#6e6e6e',
    '--color-panel-tab-active-border': '#007acc',

    '--color-git-added': '#587c0c',
    '--color-git-modified': '#895503',
    '--color-git-deleted': '#ad0707',
    '--color-git-untracked': '#388a34',

    '--color-error': '#e51400',
    '--color-warning': '#bf8803',
    '--color-info': '#1a85ff',

    '--color-bg-notification': '#ffffff',
    '--color-notification-border': '#007acc',

    '--color-scrollbar-thumb': 'rgba(100,100,100,0.4)',
    '--color-scrollbar-thumb-hover': 'rgba(100,100,100,0.7)'
  },
  // 近似 VSCode Light+ 的语法/语义着色
  tokenRules: [
    { token: 'comment', foreground: '#008000', fontStyle: 'italic' },
    { token: 'string', foreground: '#a31515' },
    { token: 'keyword', foreground: '#0000ff' },
    { token: 'number', foreground: '#098658' },
    { token: 'regexp', foreground: '#811f3f' },
    { token: 'operator', foreground: '#000000' },
    { token: 'type', foreground: '#267f99' },
    { token: 'class', foreground: '#267f99' },
    { token: 'interface', foreground: '#267f99' },
    { token: 'enum', foreground: '#267f99' },
    { token: 'namespace', foreground: '#267f99' },
    { token: 'function', foreground: '#795e26' },
    { token: 'variable', foreground: '#001080' },
    { token: 'parameter', foreground: '#001080' },
    { token: 'property', foreground: '#001080' }
  ]
}
