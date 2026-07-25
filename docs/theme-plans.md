# Mini-VSCode 主题系统计划

## 总结

目标：把当前写死在代码里的主题逻辑，逐步改成一个更接近 VSCode 的学习版主题系统。范围先控制在两块：

- 颜色主题：控制 Workbench、Monaco 编辑器、代码高亮颜色。
- 文件图标主题：控制 Explorer 和 Editor Tabs 里的文件/文件夹图标。

暂不做：

- 产品图标主题。
- 高对比主题。
- 跟随系统深浅色。
- 完整 settings schema UI。
- marketplace 主题预览。

核心主线：

```text
内置主题 / 插件贡献主题
  -> ThemeService 注册表
  -> settings.json 选择当前主题
  -> ThemeService 合成最终主题
  -> 应用到 Workbench / Monaco / 文件图标
  -> UI 通过事件刷新
```

## 当前差距

- 颜色主题目前写死在 `src/renderer/services/theme/themeService.ts`，只有 `Dark+` / `Light+`。
- `workbench.action.selectTheme` 只是深色/浅色切换，没有主题列表、预览、插件主题发现。
- 插件 manifest 类型目前只明确支持 `contributes.commands`，还没有 `contributes.themes` / `contributes.iconThemes`。
- 还没有 `workbench.colorCustomizations`、`editor.tokenColorCustomizations`、`editor.semanticTokenColorCustomizations`。
- 文件图标颜色分别写死在 Explorer 和 Editor Tabs 的 `FILE_COLORS` 中，重复且不可配置。

VSCode 参考：

- [Color Theme guide](https://github.com/microsoft/vscode-docs/blob/main/api/extension-guides/color-theme.md)
- [WorkbenchThemeService](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/services/themes/browser/workbenchThemeService.ts)
- [Theme settings/types](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/services/themes/common/workbenchThemeService.ts)
- [Theme extension points](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/services/themes/common/themeExtensionPoints.ts)
- [ColorThemeData](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/services/themes/common/colorThemeData.ts)
- [Theme configuration](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/services/themes/common/themeConfiguration.ts)
- [FileIconThemeData](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/services/themes/browser/fileIconThemeData.ts)

## 可行性结论

整体方向可行，但不要把颜色主题、插件主题、文件图标主题一次性塞进一个大改动。推荐按下面的 phase 拆开做，每个 phase 都保持应用可以启动、默认 `Dark+` / `Light+` 行为不倒退。

最适合的顺序是：先做颜色主题注册表，再做主题选择器，再做主题 JSON 和用户覆盖，最后接插件贡献和文件图标主题。

## Phase 0：文档收口

目标：确定 `docs/theme-plans.md` 是主题系统后续实现的主计划文档。

任务：

- 保留本文档作为主计划。
- 后续如果 `docs/theme-system-roadmap.md` 仍保留，避免两份文档同时更新不同内容。
- 后续实现时优先以本文档 phase 为准。

验收：

- 本文档能回答：当前缺什么、先做什么、每步怎么验证。

## Phase 1：颜色主题注册表

状态：已完成。

目标：先不改 UI 行为，只把 `Dark+` / `Light+` 从“私有 Map”改成“可注册主题”。

任务：

- 新增颜色主题数据类型，例如 `ColorThemeData`。
- 让 `ThemeService` 内部维护颜色主题注册表。
- 把 `darkPlus`、`lightPlus` 作为内置主题注册进去。
- 暴露 `getColorThemes()`，用于之后的主题选择器。
- 保留现有兼容接口：
  - `current`
  - `onDidChangeTheme`
  - `applyTheme(id)`
  - `getMonacoThemeName()`
- `workbench.colorTheme: "Dark+"` 和 `"Light+"` 继续可用。

验收：

- `pnpm tsc` 通过。
- `pnpm build` 通过。
- 默认启动仍然使用 `Dark+`。
- 手动改 `settings.json` 为 `Light+` 后仍然能切换。
- 现有 `workbench.action.selectTheme` 仍能在深色/浅色之间切换。

## Phase 2：Monaco 主题动态注册

状态：已完成。

目标：ThemeService 注册新颜色主题时，Monaco 也能认识这个主题，而不是只在 `setupMonaco()` 里提前定义两套主题。

任务：

- 把 `defineMonacoTheme(...)` 从 `monaco-setup.ts` 的内部函数改成可复用函数。
- 当 `ThemeService` 注册颜色主题时，同步调用 Monaco `defineTheme`。
- `setupMonaco()` 仍负责 Monaco worker、loader、TS/JS 默认配置。
- 避免重复定义主题导致报错或闪烁。

验收：

- `pnpm tsc` 通过。
- `pnpm build` 通过。
- `Dark+` / `Light+` 仍能正常应用。
- 注册一个新的内存主题后，`monaco.editor.setTheme(...)` 能切到它。

## Phase 3：简单颜色主题选择器

状态：已完成。

目标：把“深色/浅色切换”升级成“从列表里选择主题”。

任务：

- 扩展 `QuickInputService`，增加最小可用的 `pick(items, options)` 能力。
- 保持当前命令面板不坏。
- 把 `workbench.action.selectTheme` 改成打开主题列表。
- 主题列表来自 `ThemeService.getColorThemes()`。
- 用户确认选择后，写入：

```json
{
  "workbench.colorTheme": "主题 id"
}
```

先做简单版：

- 回车确认。
- Esc 关闭。
- 暂时不做移动预览。

验收：

- `pnpm tsc` 通过。
- `pnpm build` 通过。
- 命令面板中能执行 “Preferences: Color Theme”。
- 弹出的列表包含 `Dark+` / `Light+`。
- 选择主题后 `settings.json` 被更新。
- Command Palette 原有命令搜索和执行仍然正常。

## Phase 4：颜色主题预览

状态：已完成。

目标：补上 VSCode 主题选择器的关键体验：上下移动时临时预览，取消时恢复。

任务：

- `QuickInputService.pick(...)` 支持选中项变化事件。
- 主题选择器移动选中项时临时调用 `ThemeService.applyTheme(...)`。
- 回车确认后写入配置。
- Esc 或点击外部取消时恢复之前主题。

验收：

- `pnpm tsc` 通过。
- `pnpm build` 通过。
- `env -u ELECTRON_RUN_AS_NODE pnpm dev` 启动通过。
- 上下移动时主题会临时变化。
- Esc 后回到原来的主题。
- 回车后新主题持久化到 `settings.json`。

## Phase 5：颜色主题 JSON 加载

状态：已完成。

目标：让主题数据从 TS 对象逐步过渡到 VSCode 风格 JSON。

任务：

- 新增颜色主题 JSON loader。
- 支持学习版字段：

```json
{
  "type": "dark",
  "colors": {},
  "tokenColors": [],
  "semanticHighlighting": true,
  "semanticTokenColors": {}
}
```

- 建立 VSCode color id 到当前 CSS 变量的映射，例如：

```text
editor.background -> --color-bg-editor
sideBar.background -> --color-bg-sidebar
statusBar.background -> --color-bg-status-bar
```

- `tokenColors` 转成 Monaco `rules`。
- `semanticTokenColors` 先作为学习版数据保留，能映射的简单规则再映射到 Monaco token rule。
- 不认识的颜色 id 只打印 warning，不让应用崩溃。

验收：

- `pnpm tsc` 通过。
- `pnpm build` 通过。
- `env -u ELECTRON_RUN_AS_NODE pnpm dev` 启动通过。
- 一个本地 JSON 主题可以被加载并注册。
- 改 `editor.background` 能影响编辑器背景。
- 改 `tokenColors` 能影响 Monaco 代码高亮。
- 错误字段不会导致白屏。

## Phase 6：用户颜色覆盖

状态：已完成。

目标：实现 VSCode 的“基础主题 + 用户覆盖”模型。

任务：

- 支持 `workbench.colorCustomizations`：

```json
{
  "workbench.colorCustomizations": {
    "statusBar.background": "#ff0000"
  }
}
```

- 支持 `editor.tokenColorCustomizations`：

```json
{
  "editor.tokenColorCustomizations": {
    "comments": "#00ff00"
  }
}
```

- 支持主题限定写法：

```json
{
  "workbench.colorCustomizations": {
    "[Dark+]": {
      "statusBar.background": "#ff0000"
    }
  }
}
```

- 配置变化时重新合成当前主题，再应用到 Workbench 和 Monaco。

验收：

- `pnpm tsc` 通过。
- `pnpm build` 通过。
- `env -u ELECTRON_RUN_AS_NODE pnpm dev` 启动通过。
- 修改 `settings.json` 后颜色实时刷新。
- 删除覆盖配置后恢复主题默认色。
- 修改注释颜色后，Monaco 中注释颜色变化。

## Phase 7：插件贡献颜色主题

状态：已完成。

目标：让插件可以通过 manifest 贡献颜色主题，不需要激活插件代码。

任务：

- 扩展 `ExtensionDescription.contributes` 类型，支持：

```ts
themes?: {
  id?: string
  label?: string
  uiTheme: 'vs' | 'vs-dark'
  path: string
}[]
```

- 扩展宿主扫描 manifest 时继续保留 `contributes.themes`。
- Renderer 的 `ExtensionService` 在已安装、已启用插件变化时，把主题注册到 `ThemeService`。
- 新增一个 `gallery/mini-themes` 示例插件。
- 示例插件包含一个颜色主题 JSON。

验收：

- 安装示例插件后，主题选择器出现新主题。
- 禁用或卸载插件后，新主题从列表中消失。
- 当前主题来自被卸载插件时，自动回退到 `Dark+`。
- 插件主题不需要 activation event，也不需要执行 extension.js。

## Phase 8：文件图标基础收口

目标：先去掉重复硬编码，让 Explorer 和 Editor Tabs 使用同一套图标解析逻辑。

任务：

- 新增共享 `FileIcon` 组件。
- 新增最小文件图标 resolver。
- 把 Explorer 和 Editor Tabs 中重复的 `FILE_COLORS` 移走。
- 暂时保持现有颜色表现不变。

验收：

- Explorer 文件图标看起来不变。
- Editor Tabs 文件图标看起来不变。
- 两个地方同一种后缀使用同一种颜色。

## Phase 9：文件图标主题

目标：增加 `workbench.iconTheme`，让文件图标也能由主题控制。

任务：

- 新增配置：

```json
{
  "workbench.iconTheme": "mini-icons"
}
```

- 扩展 `ThemeService` 或独立 `FileIconThemeService`，支持：
  - `getFileIconThemes()`
  - `setFileIconTheme(id)`
  - `resolveFileIcon(...)`
  - `onDidChangeFileIconTheme`

- 支持学习版字段：
  - `iconDefinitions`
  - `file`
  - `folder`
  - `folderExpanded`
  - `fileExtensions`
  - `fileNames`
  - `folderNames`
  - `languageIds`
  - `hidesExplorerArrows`

- 匹配顺序：

```text
文件：完整文件名 -> 最长后缀 -> languageId -> 默认文件图标
文件夹：文件夹名 -> 展开/折叠状态 -> 默认文件夹图标
```

- 支持 `workbench.iconTheme: null` 隐藏文件图标，但保持列表布局稳定。

验收：

- 切换文件图标主题后，Explorer 和 Editor Tabs 同时变化。
- `workbench.iconTheme: null` 不造成布局跳动。
- 旧文件类型颜色迁移到默认 `mini-icons` 主题中。

## Phase 10：插件贡献文件图标主题

目标：让插件通过 manifest 贡献文件图标主题。

任务：

- 扩展 `ExtensionDescription.contributes` 类型，支持：

```ts
iconThemes?: {
  id: string
  label?: string
  path: string
}[]
```

- `ExtensionService` 注册已安装、已启用插件贡献的 icon theme。
- `gallery/mini-themes` 示例插件增加一个 icon theme JSON。

验收：

- 安装示例插件后，文件图标主题选择器出现新主题。
- 禁用或卸载插件后，该图标主题消失。
- 当前图标主题来自被卸载插件时，回退到默认 `mini-icons`。

## 验证计划

每个 phase 完成后至少运行：

```bash
pnpm tsc
pnpm build
```

需要手动验证时运行：

```bash
pnpm dev
```

重点检查：

- 默认 `Dark+` 能正常显示。
- `Light+` 能正常切换。
- 主题选择器不影响命令面板。
- 改 `settings.json` 后 UI 能实时响应。
- 插件安装、禁用、卸载不会让主题系统崩溃。
- Explorer 和 Editor Tabs 的文件图标保持一致。

## 实现原则

- 不追求一次性完整复刻 VSCode，优先学习它的主干机制。
- 每个 phase 都要能独立验证。
- Renderer 仍然不能直接 import Node 模块；读文件必须通过现有 preload/main 能力。
- 保持现有 `Dark+` / `Light+` 配置兼容。
- Monaco 0.55 没有完整 VSCode `semanticTokenColors` 能力，语义高亮只做学习版近似支持。
- 文件图标主题先做颜色/内联图形版本，`iconPath`、字体图标、CSS 生成后续再扩展。
