# 主题系统学习改造计划

> 目标：把 mini-vscode 现在“写死的深色/浅色主题”，逐步改成更像 VSCode 的主题系统。先做颜色主题和文件图标主题，保证每一步都容易理解、容易验证。

## 一句话主线

VSCode 的主题系统不是“组件里写颜色”，而是这条链路：

```text
插件/内置主题贡献
  → 主题注册表
  → settings.json 选择当前主题
  → ThemeService 应用到 Workbench / Monaco / 文件图标
  → UI 通过事件自动刷新
```

mini-vscode 现在已经有最后半段：`ThemeService` 能根据 `workbench.colorTheme` 应用 CSS 变量和 Monaco 主题。后续要补的是前半段：主题注册、主题文件加载、插件贡献、用户覆盖、文件图标主题。

## 当前还差什么

| 模块 | 现在的 mini-vscode | VSCode 的核心做法 | 本计划要补到哪里 |
| --- | --- | --- | --- |
| 颜色主题来源 | `Dark+` / `Light+` 写死在代码里 | 内置主题 + 插件 `contributes.themes` | 支持内置注册和插件贡献 |
| 主题选择 | 命令只在深色/浅色之间切换 | Quick Pick 列出所有主题，可预览 | 做一个主题选择列表 |
| 主题格式 | TS 对象里直接写 CSS 变量 | JSON 主题文件：`colors` / `tokenColors` / `semanticTokenColors` | 支持学习版 JSON 加载 |
| 用户覆盖 | 只能改 `workbench.colorTheme` | `workbench.colorCustomizations` 等配置可实时覆盖 | 支持常用覆盖项 |
| 文件图标 | Explorer 和 Tab 各有一份写死映射 | `workbench.iconTheme` + `contributes.iconThemes` | 抽成统一文件图标主题 |
| 产品图标/高对比 | 没有 | VSCode 还有 product icon、high contrast、系统跟随 | 暂不做，作为后续扩展 |

## 第一阶段：先把路线文档写清楚

状态：已执行。

任务：

- 新增本文档，作为后续改造的 checklist。
- 明确本轮范围：颜色主题 + 文件图标主题。
- 明确暂不做：产品图标主题、高对比模式、跟随系统深浅色、完整 settings schema。

验收：

- 文档存在于 `docs/theme-system-roadmap.md`。
- 文档能回答三个问题：现在缺什么、后续每步做什么、每步怎么验证。

## 第二阶段：把主题变成“可注册”的数据

目标：不要让 `ThemeService` 只认识写死的 `Dark+` 和 `Light+`。

任务：

- 给颜色主题定义统一类型，例如 `ColorThemeData`。
- 给文件图标主题定义统一类型，例如 `FileIconThemeData`。
- 在 `ThemeService` 内部维护两个注册表：
  - 颜色主题注册表
  - 文件图标主题注册表
- 把现有 `darkPlus`、`lightPlus` 改成注册进去的内置主题。
- 保留现有 `workbench.colorTheme: "Dark+"` 行为，避免老配置失效。

验收：

- 默认启动仍然是 `Dark+`。
- 手动把 `settings.json` 改成 `Light+` 仍然能切换。
- `ThemeService` 不再依赖只有两项的固定 Map，而是从注册表查找主题。

## 第三阶段：做真正的主题选择器

目标：不再只是“深色/浅色切换”，而是能列出所有颜色主题。

任务：

- 扩展 `QuickInputService`，让它除了命令面板，也能显示一组可选择的条目。
- 把 `workbench.action.selectTheme` 改成“选择颜色主题”。
- 主题列表来自 `ThemeService.getColorThemes()`。
- 选择后写入：

```json
{
  "workbench.colorTheme": "主题 id"
}
```

推荐行为：

- 上下移动时可以临时预览。
- 回车确认后持久化。
- Esc 取消时恢复原主题。

验收：

- 命令面板能看到 “Preferences: Color Theme”。
- 执行后能看到主题列表。
- 选中主题后 `settings.json` 被更新。
- 取消选择不会把临时预览保存下来。

## 第四阶段：支持插件贡献颜色主题

目标：学习 VSCode 最重要的思想：主题可以由插件贡献，不一定写在主程序里。

任务：

- 扩展插件 manifest 解析，让 `ExtensionDescription.contributes` 支持：

```json
{
  "contributes": {
    "themes": [
      {
        "id": "mini-ocean",
        "label": "Mini Ocean",
        "uiTheme": "vs-dark",
        "path": "./themes/mini-ocean.json"
      }
    ]
  }
}
```

- 扩展宿主扫描插件时，把 `contributes.themes` 原样传给 renderer。
- Renderer 的 `ExtensionService` 拿到已安装、已启用插件后，把主题注册进 `ThemeService`。
- 新增一个 `gallery/mini-themes` 示例插件。

验收：

- 安装示例主题插件后，颜色主题选择器里出现新主题。
- 禁用或卸载插件后，该主题从列表里消失。
- 如果当前主题来自被卸载插件，自动回退到 `Dark+`。

## 第五阶段：支持颜色主题 JSON 文件

目标：让主题数据更接近 VSCode，而不是继续手写 TS 对象。

任务：

- 新增主题 JSON 加载逻辑。
- 支持这些字段：

```json
{
  "type": "dark",
  "colors": {},
  "tokenColors": [],
  "semanticHighlighting": true,
  "semanticTokenColors": {}
}
```

- `colors` 控制 Workbench 颜色，比如编辑器背景、侧边栏、状态栏。
- `tokenColors` 控制代码高亮，比如注释、字符串、关键字。
- `semanticTokenColors` 先做学习版支持：保留数据结构，能映射的简单规则映射到 Monaco token rule。
- 增加一张颜色映射表：把 VSCode 风格颜色 id 映射到当前 CSS 变量。

例子：

```text
editor.background → --color-bg-editor
sideBar.background → --color-bg-sidebar
statusBar.background → --color-bg-status-bar
```

验收：

- 内置主题也走同一套加载/转换流程。
- 插件主题 JSON 修改颜色后，UI 能显示对应变化。
- 不认识的颜色 id 只打印 warning，不让应用崩溃。

## 第六阶段：支持用户自定义颜色

目标：学习 VSCode 的“主题叠加”规则。

最终效果：

```text
基础主题
  + workbench.colorCustomizations
  + editor.tokenColorCustomizations
  + editor.semanticTokenColorCustomizations
  = 最终显示效果
```

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

验收：

- 改 `settings.json` 后，颜色实时刷新。
- 修改状态栏颜色能马上看到。
- 修改注释颜色后，Monaco 里的注释颜色变化。
- 删除自定义配置后，回到主题默认颜色。

## 第七阶段：做文件图标主题

目标：把 Explorer 和 Editor Tabs 里的文件图标统一交给主题系统。

任务：

- 新增配置：

```json
{
  "workbench.iconTheme": "mini-icons"
}
```

- 抽出共享 `FileIcon` 组件。
- 删除 Explorer 和 Editor Tabs 中重复的 `FILE_COLORS`。
- `FileIcon` 不自己判断颜色，而是问 `ThemeService.resolveFileIcon(...)`。
- 支持学习版图标主题字段：
  - `iconDefinitions`
  - `file`
  - `folder`
  - `folderExpanded`
  - `fileExtensions`
  - `fileNames`
  - `folderNames`
  - `languageIds`

匹配顺序：

```text
文件：完整文件名 → 最长后缀 → languageId → 默认文件图标
文件夹：文件夹名 → 展开/折叠状态 → 默认文件夹图标
```

验收：

- Explorer 和 Editor Tabs 中同一种文件显示同一种图标。
- 切换 `workbench.iconTheme` 后两个地方同时变化。
- 设置 `workbench.iconTheme: null` 后图标隐藏，但列表布局不乱。

## 最终验证清单

每完成一个阶段都跑：

```bash
pnpm tsc
pnpm build
pnpm dev
```

手动检查：

- 默认主题能正常显示。
- 主题选择器能打开。
- 选择主题后配置被写入。
- 外部编辑 `settings.json` 后 UI 会更新。
- 安装主题插件后主题出现在列表里。
- 卸载主题插件后不崩溃。
- 文件图标在 Explorer 和 Tab 中保持一致。

## 暂时不做的内容

这些属于后续进阶，不放进本轮：

- `workbench.productIconTheme`
- 高对比主题
- 跟随系统深浅色
- 完整 JSON schema 自动补全
- 完整 TextMate `.tmTheme` 解析
- 文件图标字体和图片资源的完整 CSS 生成

这样拆的好处是：每一步都能独立运行、独立验证，而且每一步都对应 VSCode 源码里的一个核心概念。
