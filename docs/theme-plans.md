# Mini-VSCode 主题系统计划

## 总结

目标：把当前主题实现逐步改成一个更接近 VSCode 的学习版主题系统。这里追求的不是主题数量，而是尽量保留 VSCode 的关键边界：

- 主题服务是当前主题的唯一所有者。
- 主题贡献只负责注册资源，配置负责选择和覆盖。
- 主题元数据注册与主题文件加载分离。
- Workbench、Monaco、文件图标分别消费同一份已解析主题状态。
- 初始化、预览、持久化、插件禁用/卸载都有明确生命周期。

当前进度：

- Phase 1～7 已完成，颜色主题已经有注册表、选择器、预览、JSON loader、用户覆盖和插件贡献。
- Phase 8～10 尚未完成，文件图标仍然写死在 Explorer 和 Editor Tabs 中。
- 产品图标主题、高对比主题和跟随系统深浅色放在主干稳定之后。

核心主线：

```text
内置主题 / 扩展贡献主题
  -> 主题注册表（只登记元数据和资源位置）
  -> 配置层选择当前主题
  -> 按需加载主题文件
  -> 合并用户 / 工作区覆盖
  -> 得到已解析主题
  -> ThemeService 应用到 Workbench / Monaco
  -> UI 通过事件刷新
```

文件图标主题和产品图标主题沿用同样的“注册 -> 选择 -> 加载 -> 应用 -> 事件”模型，但不把三类主题的数据结构硬塞进同一个类型。

## 当前实现基线

截至 Phase 7，项目已经具备：

- `ThemeService` 维护内置主题和插件主题注册表。
- `workbench.action.selectTheme` 从注册表展示主题，支持移动预览、确认持久化和取消恢复。
- `workbench.colorTheme`、`workbench.colorCustomizations`、`editor.tokenColorCustomizations` 会驱动主题重新合成。
- 主题 JSON 的 `colors`、`tokenColors` 和学习版 `semanticTokenColors` 能映射到 CSS 变量和 Monaco。
- 插件可以用 `contributes.themes` 静态贡献主题；安装、启用、禁用、卸载会注册或释放主题，不执行 `extension.js`。
- Workbench 使用 CSS 变量；Monaco 通过 `defineTheme` / `setTheme` 适配；Terminal 监听主题事件后刷新 xterm 配色。

仍然明显可见的问题：

- `setupMonaco()` 在 React 和 `ThemeService.initialize()` 之前固定注册并应用 `Dark+`；随后 `ThemeService` 再根据配置应用一次主题，首次主题有两个所有者，浅色或插件主题启动时可能先闪一下深色。
- 插件主题注册时就读取并解析所有主题 JSON，注册元数据和加载主题资源还没有分层。
- 静态扩展描述来自扩展宿主的扫描结果。虽然不会激活扩展代码，但主题发现仍要等待 MessagePort 和扩展宿主连接。
- 配置只有 `~/.mini-vscode/settings.json` 一层，还没有项目根目录 `.vscode/settings.json`。
- 主题文件里的 `semanticTokenColors` 只有简单映射，还不支持用户级 `editor.semanticTokenColorCustomizations` 和完整 selector 优先级。
- VSCode color id 到 CSS 变量仍是手工映射；Debug、Command Palette、断点等位置还有未纳入主题系统的硬编码颜色。
- 文件图标颜色分别写死在 Explorer 和 Editor Tabs 的 `FILE_COLORS` 中，重复且不可配置。

## 与 VSCode 真正主题系统的差距

| 维度 | 当前项目 | VSCode 的做法 | 学习优先级 |
| --- | --- | --- | --- |
| 首帧与所有权 | `setupMonaco()` 先固定应用 `Dark+`，配置加载后 `ThemeService` 再应用 | `WorkbenchThemeService` 是 eager service，先从 storage 恢复上次已解析的颜色/图标，扩展注册完成后再加载真实主题并校正 | P0 |
| 注册与加载 | 注册 `ColorThemeData` 时主题已经完整加载 | 注册表先保存主题 id、label、资源位置和扩展信息；选中时再 `ensureLoaded` | P0 |
| 静态扩展点 | Renderer 从扩展宿主取得 manifest，再注册主题 | Workbench 侧消费已安装扩展描述并建立 ThemeRegistry；静态主题贡献不依赖扩展代码激活 | P1 |
| 配置层级 | 只有默认值和用户 settings | 默认、用户、远程、工作区、工作区文件夹等层级；预览和写入目标也是显式参数 | P1 |
| 颜色注册表 | 手写 `color id -> CSS 变量` 映射，组件直接依赖私有变量 | `registerColor(id, defaults, description)` 建立公共颜色 token、默认值和 schema，再由主题解析与 theming participant 生成动态 CSS | P1 |
| 主题文件兼容 | 支持常用 `colors`、TextMate token 和简单语义 token 映射 | 支持 `include`、更完整的 TextMate scope、语义 token selector/修饰符/语言限定、主题文件监听与重载 | P2 |
| 注册表生命周期 | 重复 id 只 warning；当前插件主题移除后回退 `Dark+` | 注册表发出 added/removed 事件；主题暂时消失时记住原主题，资源恢复后可自动恢复；加载错误有明确诊断 | P1 |
| 三类主题 | 颜色主题主干已完成；文件图标和产品图标未完成 | 颜色主题、文件图标主题、产品图标主题各有独立 registry/data/loader/event，但由一个 WorkbenchThemeService 协调 | P1/P3 |
| 高对比与系统主题 | 只有 `dark` / `light` | 还有高对比类型、首选颜色方案和系统深浅色监听 | P3 |

## 可以保留的学习版差异

缩小差距不等于逐行复制 VSCode。以下差异可以保留，只要边界清楚：

- 项目使用 standalone Monaco，所以最终仍需要 `defineTheme()` / `setTheme()` 适配；VSCode 内部编辑器直接消费平台主题服务。需要修正的是“只能由 `ThemeService` 调用”，不是删掉 Monaco 适配层。
- Workbench 继续使用 CSS 变量是合理的。VSCode 会从 color registry 和 theming participants 生成动态 CSS；本项目可以把 CSS 变量当成生成结果，而不是让它们继续充当公共颜色注册表本身。
- 先做单根工作区的 default/user/workspace 三层即可，不必立即复制 remote、profile、workspace folder 和 settings sync。
- 暂不做完整 settings schema UI、未安装 Marketplace 主题预览和遥测；它们不是主题解析与应用主链路。

这里有一个容易混淆但很重要的结论：**主题来源优先级**和**配置覆盖优先级**不是一回事。

```text
主题来源：
  内置主题 / 扩展主题 -> 都只是向注册表贡献候选主题
  同 id 冲突应该被诊断，不应该简单规定“插件覆盖内置”

配置覆盖：
  默认配置 < 用户配置 < 工作区配置
  主题默认颜色 < 用户 colorCustomizations < 工作区 colorCustomizations
```

也就是说，`.vscode/settings.json` 决定“选哪个主题、再覆盖哪些 token”，插件只负责“提供哪些主题资源”。

VSCode 参考：

- [Color Theme guide](https://github.com/microsoft/vscode-docs/blob/main/api/extension-guides/color-theme.md)
- [WorkbenchThemeService](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/services/themes/browser/workbenchThemeService.ts)
- [Theme settings/types](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/services/themes/common/workbenchThemeService.ts)
- [Theme extension points](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/services/themes/common/themeExtensionPoints.ts)
- [ColorThemeData](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/services/themes/common/colorThemeData.ts)
- [Color registry](https://github.com/microsoft/vscode/blob/main/src/vs/platform/theme/common/colorRegistry.ts)
- [Theme configuration](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/services/themes/common/themeConfiguration.ts)
- [FileIconThemeData](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/services/themes/browser/fileIconThemeData.ts)

## 可行性结论

当前方向是正确的，Phase 1～7 已经走通了“贡献、选择、解析、应用、响应变化”主干。下一步不应该继续堆更多主题字段，而应该先收紧所有权和生命周期，再做文件图标。

推荐顺序：

```text
Phase 7.1 首帧恢复与单一所有权
  -> Phase 7.2 元数据注册、按需加载与静态扩展点
  -> Phase 8～10 文件图标主题
  -> Phase 11 配置层级和写入目标
  -> Phase 12 公共颜色注册表
  -> Phase 13 主题文件兼容、监听和语义 token
  -> Phase 14 产品图标、高对比和系统主题（后置）
```

为了学习 VSCode 架构，Phase 7.1、7.2、11、12 的价值高于继续增加 JSON 字段数量。

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

## Phase 7.1：首帧恢复与主题单一所有权

状态：已完成。

目标：让 `ThemeService` 成为首次主题和后续主题的唯一所有者，消除固定 `Dark+` 首帧和重复应用。

背景：

```text
当前：
  index.tsx -> setupMonaco() -> 固定 setTheme(Dark+)
  React 首屏
  -> ConfigurationService.initialize()
  -> ThemeService.initialize()
  -> 再应用用户配置主题

目标：
  创建 DI 容器
  -> eager 创建 ThemeService
  -> 同步恢复上次成功应用的已解析主题
  -> React 首屏
  -> 配置与扩展主题注册表就绪
  -> 加载并校正真实主题
```

任务：

- `setupMonaco()` 只保留 loader、worker 和语言默认配置，不再决定具体颜色主题。
- 在 Workbench 首次绘制前显式创建 `ThemeService`；学习版无需先完整复制 VSCode 的 `InstantiationType.Eager`，但要保留“核心服务 eager 恢复状态”的语义。
- 为已成功加载的当前主题保存一份启动快照，至少包括：
  - 主题 id、type、Monaco base。
  - 已解析 CSS colors。
  - 已解析 Monaco token rules。
- 启动时先同步应用快照；没有可用快照时才使用内置 `Dark+`。
- 配置和静态主题注册完成后，再按 `workbench.colorTheme` 加载真实主题并校正。
- 预览主题不写启动快照，取消预览也不污染启动状态。
- 快照来自已卸载插件时，允许它只负责首帧；注册表完成校正后回退到可用内置主题。
- Electron `BrowserWindow.backgroundColor` 与默认启动主题策略保持一致，避免窗口创建阶段先出现固定深色底。

验收：

- 配置为 `Light+` 后重启，不先出现 `Dark+` 的 Workbench 或 Monaco 首帧。
- 配置为 `Mini Ocean` 后重启，插件代码不激活，首帧仍尽量保持上次主题。
- `setupMonaco()` 中没有具体 `Dark+` / `Light+` 的注册和应用逻辑。
- 主题预览后按 Esc，再重启不会恢复到被取消的预览主题。
- 删除提供当前主题的插件后重启，应用能从快照平滑校正到 `Dark+`，不白屏。

## Phase 7.2：主题元数据、按需加载与静态扩展点边界

目标：让主题注册表管理“有哪些主题”，loader 只在需要时管理“主题文件里是什么”，并让静态贡献不依赖扩展宿主运行时。

任务：

- 把插件主题贡献先规范化成未加载元数据：

```ts
interface ColorThemeContribution {
  id: string
  label: string
  uiTheme: 'vs' | 'vs-dark'
  location: string
  extensionId?: string
}
```

- `ThemeRegistry` 负责：
  - 注册和注销主题元数据。
  - 查询、排序和 added/removed 变化事件。
  - 检测 settings id 冲突、资源越界和 `monacoThemeName()` 归一化后的名称冲突。
- `ColorThemeData` 增加 unloaded/loaded 状态；选择、预览或启动恢复真实主题时才 `ensureLoaded()`。
- 给主题切换加串行队列或版本号，避免快速预览时较慢的旧加载结果覆盖较新的选择。
- 当前主题被禁用或卸载时记住缺失主题 id，临时回退内置主题；相同主题重新出现时按配置自动恢复。
- 加载失败时保留上一套成功主题，并通过 Notification/日志指出主题 id、扩展 id 和资源路径。
- 把“已安装扩展描述”从“扩展宿主扫描结果”提升为静态扩展贡献的公共来源：
  - main 继续持有扩展目录和文件系统真相。
  - Renderer 从主进程取得已安装 manifest 描述并注册 commands/themes 等静态贡献。
  - 扩展宿主只负责 activation、运行时 API 和动态注册，不再是静态主题发现的前置条件。
- 浏览器 preview 使用同一份 manifest mock，保证没有扩展宿主端口时仍可验证静态贡献。

验收：

- 安装多个主题插件时，启动只加载当前主题文件；打开选择器只需要主题元数据。
- 快速上下移动预览时，最终显示的一定是最后选中的主题。
- 暂时禁用当前主题插件会回退；重新启用后，配置不变且主题自动恢复。
- 重复 id、Monaco 名称冲突、越界路径和损坏 JSON 都有明确诊断，不覆盖已有主题。
- 人为延迟扩展宿主连接时，插件主题仍能出现在主题选择器中。
- 插件主题整个注册、选择和应用过程不会执行 `extension.js`。

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

## Phase 11：配置层级和主题写入目标

目标：补上单工作区场景下最有学习价值的配置优先级，不急着复制远程、Profile 和多根工作区。

任务：

- 把配置模型拆成：

```text
defaults
  < ~/.mini-vscode/settings.json
  < <workspace>/.vscode/settings.json
```

- `ConfigurationService` 暴露合并后的值，并能 `inspect(key)` 看见 default/user/workspace 各层值。
- 工作区打开、切换或关闭时，更新 `.vscode/settings.json` watcher 和有效配置。
- `workbench.colorTheme`、`workbench.colorCustomizations`、`editor.tokenColorCustomizations` 按层合并。
- 将主题应用与配置写入解耦，接口显式区分：
  - `preview`：只应用，不写配置和启动快照。
  - `user`：写用户 settings。
  - `workspace`：写 `.vscode/settings.json`。
  - `auto`：写回当前实际生效值所在层，找不到时写 user。
- 选择主题时默认保持当前简单体验；增加“写到工作区”的命令或明确入口，不强迫每次弹二级菜单。

验收：

- 用户配置为 `Dark+`、工作区配置为 `Light+` 时，打开该工作区使用 `Light+`。
- 关闭工作区后恢复用户主题。
- 删除工作区主题配置后立即回到用户主题。
- 工作区颜色覆盖只影响该工作区，不改用户 settings。
- 预览、取消、确认分别只产生预期层级的写入。

## Phase 12：公共颜色注册表与硬编码颜色收口

目标：让 UI 依赖有语义的 VSCode color id，而不是由主题 loader 和组件共同维护一套私有 CSS 变量约定。

任务：

- 实现学习版 `ColorRegistry`：

```ts
registerColor(
  id,
  { dark, light, highContrast? },
  description
)
```

- 内置组件注册自己使用的颜色 token；主题只覆盖 token 值，不关心组件文件名。
- `ThemeService` 用“主题颜色 -> token 默认值 -> 最终颜色”的顺序解析，并集中生成 CSS 变量。
- 现有 `--color-*` 可以作为迁移期输出，不要求一次重写所有 CSS。
- 为少量无法只靠 CSS 变量表达的场景提供学习版 theming participant；普通组件继续优先使用 CSS 变量。
- 审计并迁移这些明显硬编码：
  - Debug View / Debug Console 状态色。
  - Command Palette 特殊文字色。
  - Monaco 断点装饰色。
  - 窗口初始背景色。
  - Explorer / Tabs 文件图标色由 Phase 8～10 处理，不混入颜色主题。
- 未注册 color id 和主题中未知 color id 分别给出诊断。

验收：

- 新增一个 UI 颜色只需要注册 color id 并在组件消费，不需要修改主题服务核心逻辑。
- `Dark+` / `Light+` 在缺少某个主题覆盖时能使用各自 token 默认值。
- 切换主题后 Debug、Command Palette 和断点颜色一起变化。
- 主题 JSON 中未知 token 不白屏，并能定位到具体 id。

## Phase 13：主题文件兼容、监听与语义 token

目标：在不复制 VSCode 全部兼容历史的前提下，让常见 VSCode 颜色主题可以更少改动地运行。

任务：

- 支持主题 JSON `include`，实现相对路径解析、合并顺序和循环引用检测。
- 补齐常见 TextMate `scope` 数组、多 scope 字符串和 `fontStyle` 合并行为。
- 支持语义 token selector 的最小正确子集：

```text
type
type.modifier
type:language
type.modifier:language
```

- 支持 `editor.semanticTokenColorCustomizations`，并与主题文件中的 `semanticTokenColors` 按主题限定和配置层级合并。
- 明确职责：
  - LSP/语言扩展提供 semantic tokens 数据。
  - 主题系统只解析 selector、决定样式并交给 Monaco。
  - 没有 semantic token provider 时，不伪造语义 token。
- 只监听当前已加载主题资源；扩展开发模式下文件变化会 reload，普通未选中主题不建立 watcher。
- reload 失败时继续使用上一份有效主题，并展示错误。
- 增加 loader fixture，覆盖 include、循环引用、错误 JSON、TextMate scopes 和语义 selector 优先级。

验收：

- 一个带 `include` 的常见 VSCode 主题能加载并正确覆盖父主题。
- 循环 include 不会卡死，错误能指出资源链。
- 修改当前开发主题 JSON 后，无需重启即可刷新。
- 没有 semantic token provider 时只有 TextMate 高亮；安装提供者后语义颜色按 selector 生效。
- 较具体的 `type.modifier:language` 能覆盖较宽泛的 `type`。

## Phase 14：产品图标、高对比和系统主题

状态：后置，Phase 7.1～13 稳定后再做。

目标：补齐 VSCode 的第三类主题和颜色方案变化，但不阻塞颜色/文件图标主干。

任务：

- 产品图标独立实现 `ProductIconThemeRegistry`、数据、loader、当前主题和变化事件。
- 支持 `workbench.productIconTheme` 与 `contributes.productIconThemes`。
- 先只让 Workbench 中共享 action icon 走产品图标主题，不把文件图标混进来。
- 颜色主题类型扩展到 `hcDark` / `hcLight`，补充必要的对比度和 focus border token。
- 增加跟随系统深浅色设置，监听 Electron 原生主题变化。
- 沿用 Phase 7.1 的启动快照，以及 Phase 7.2 的注册、按需加载和移除恢复机制。

验收：

- 切换产品图标主题不改变文件图标。
- 插件产品图标主题不需要激活扩展代码。
- 系统深浅色变化只在开启跟随设置时切换。
- 高对比主题至少保证焦点、选中、错误和输入边框可辨识。

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

- 默认 `Dark+` 能正常显示，`Light+` 能正常切换。
- 重启时首帧、Workbench 和 Monaco 不出现不同主题。
- 主题选择器不影响命令面板。
- 快速预览、取消和确认没有异步竞态。
- 改 `settings.json` 后 UI 能实时响应。
- 插件安装、禁用、卸载、重新启用不会让主题系统崩溃或丢失配置意图。
- 损坏主题文件、重复 id 和资源路径错误不会覆盖上一份有效主题。
- 用户和工作区配置按预期合并，不相互污染。
- Explorer 和 Editor Tabs 的文件图标保持一致。

## 实现原则

- `ThemeService` 是当前主题和应用动作的唯一所有者；`setupMonaco()` 只做 Monaco 环境初始化。
- 分清四步：注册元数据、加载资源、解析覆盖、应用主题。不要再把四步塞进 `registerColorTheme()`。
- 分清三类主题：颜色主题、文件图标主题、产品图标主题共享生命周期模型，但数据和事件独立。
- 分清主题来源和配置层级：插件不是用户设置或 `.vscode/settings.json` 的更高优先级。
- 预览是显式 target，不写配置、不写启动快照；确认后才持久化。
- 插件静态贡献不依赖扩展代码激活，注册和注销必须返回 `IDisposable`。
- 每个 phase 都要能独立验证。
- Renderer 仍然不能直接 import Node 模块；读文件必须通过现有 preload/main 能力。
- 保持现有 `Dark+` / `Light+` 配置兼容。
- Monaco 是颜色主题的消费端和适配器，不是 Workbench 主题状态的所有者。
- 不追求一次性完整复刻 VSCode；优先学习 eager restore、registry、loader、configuration target 和 disposable 生命周期。
- 文件图标主题先做颜色/内联图形版本，`iconPath`、字体图标、CSS 生成后续再扩展。
- 暂不复制完整 settings schema UI、Marketplace 未安装主题预览、Profiles、Settings Sync、远程配置和多根工作区；这些不会改变主题系统主干。
