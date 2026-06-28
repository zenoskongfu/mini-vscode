# 打包路径与内置扩展调查报告

## 结论先行

`app` 对象来自 Electron：

```ts
import { app } from 'electron'
```

它只能在 main 进程、preload、utility process 等 Electron/Node 侧代码里直接使用。renderer 不能直接 `import { app } from 'electron'`，renderer 要通过 preload 暴露的 `window.electronAPI` 间接请求 main 进程能力。

`app.getPath('userData')` 表示当前应用专属的用户可写目录。macOS 上通常类似：

```text
~/Library/Application Support/Zenos Mini VSCode
```

它适合放用户安装的扩展、内部状态、缓存、可写配置等。不能把用户安装扩展写到 `app.getAppPath()/extensions`，因为生产包里 `app.getAppPath()` 会指向 `Contents/Resources/app.asar`，`app.asar` 是归档文件，不是真实可写目录。

当前扩展安装失败的直接原因是：

```text
mkdir .../Contents/Resources/app.asar/extensions
```

也就是把“用户安装扩展目录”放进了只读应用包。

## `app` 对象来自哪里

本项目 main 入口直接从 Electron 导入 `app`：

- [src/main/index.ts](/Users/chengtongxue/Project/_Electron/mini-vscode/src/main/index.ts:1)

扩展安装服务也直接导入 `app`：

- [src/main/extensions/extensionManagementService.ts](/Users/chengtongxue/Project/_Electron/mini-vscode/src/main/extensions/extensionManagementService.ts:4)

扩展宿主启动器同样从 Electron 导入 `app`：

- [src/main/extensions/extensionHostProcess.ts](/Users/chengtongxue/Project/_Electron/mini-vscode/src/main/extensions/extensionHostProcess.ts:1)

这些文件都在 main 进程侧，所以可以直接调用 Electron API。Electron 官方文档也把 `app.getAppPath()`、`app.getPath(name)`、`app.isPackaged` 定义在 `app` 模块上，并说明 `userData` 是用于存放应用配置文件的目录。

参考：

- Electron `app.getAppPath()`: https://www.electronjs.org/docs/latest/api/app#appgetapppath
- Electron `app.getPath(name)`: https://www.electronjs.org/docs/latest/api/app#appgetpathname
- Electron `app.isPackaged`: https://www.electronjs.org/docs/latest/api/app#appispackaged-readonly

## 可以直接调用吗

分场景：

| 位置 | 能否直接调用 `app` | 原因 |
| --- | --- | --- |
| `src/main/**` | 可以 | main 进程有 Electron/Node 权限 |
| `src/preload/**` | 技术上可导入 Electron API，但应只暴露受控能力 | preload 是安全边界 |
| `src/exthost/**` | 不建议依赖 Electron `app` | extension host 应保持类似 VS Code 的隔离宿主，路径由 main 初始化时传入 |
| `src/renderer/**` | 不可以 | renderer 是 sandboxed web 环境，不能直接碰 Electron/Node |

renderer 侧已有类型化桥：

- preload 暴露 `window.electronAPI`: [src/preload/index.ts](/Users/chengtongxue/Project/_Electron/mini-vscode/src/preload/index.ts:8)
- renderer 类型声明在 [src/preload/index.d.ts](/Users/chengtongxue/Project/_Electron/mini-vscode/src/preload/index.d.ts:4)

所以如果 renderer 想拿某个 app 路径，正确方式不是导入 `app`，而是新增一个 main IPC：

```ts
ipcMain.handle('app:getPath', (_e, name) => app.getPath(name))
```

再通过 preload 暴露：

```ts
app: {
  getPath: (name: string) => ipcRenderer.invoke('app:getPath', name)
}
```

## 需要 TS 声明吗

在 main 侧不需要额外声明：

```ts
import { app } from 'electron'
```

`electron` 包自带 TypeScript 类型，本项目也已经把 `electron` 放在 `devDependencies`：

- [package.json](/Users/chengtongxue/Project/_Electron/mini-vscode/package.json:33)

只有当你把能力暴露给 renderer 时，才需要更新 `src/preload/index.d.ts`，给 `window.electronAPI` 新增类型。

不要写这种声明：

```ts
declare const app: unknown
```

这会绕过 Electron 类型，反而更容易把 main/renderer 边界弄混。

## 本项目中开发/生产不一样的地方

### 1. `app.getAppPath()`：开发态项目根，生产态 `app.asar`

当前有 3 个相关用法：

- `galleryDir = path.join(app.getAppPath(), 'gallery')`: [src/main/extensions/extensionManagementService.ts](/Users/chengtongxue/Project/_Electron/mini-vscode/src/main/extensions/extensionManagementService.ts:23)
- `extensionsDir = path.join(app.getAppPath(), 'extensions')`: [src/main/extensions/extensionManagementService.ts](/Users/chengtongxue/Project/_Electron/mini-vscode/src/main/extensions/extensionManagementService.ts:24)
- extension host 扫描目录 `path.join(app.getAppPath(), 'extensions')`: [src/main/extensions/extensionHostProcess.ts](/Users/chengtongxue/Project/_Electron/mini-vscode/src/main/extensions/extensionHostProcess.ts:23)

开发态：

```text
app.getAppPath() ~= /Users/.../mini-vscode
```

生产态：

```text
app.getAppPath() ~= .../Zenos Mini VSCode.app/Contents/Resources/app.asar
```

因此：

```ts
path.join(app.getAppPath(), 'extensions')
```

开发态是可写目录，生产态是 `app.asar/extensions`，不可写。

### 2. renderer 加载路径

`WindowManager` 根据 `ELECTRON_RENDERER_URL` 决定加载开发服务器还是本地文件：

- [src/main/window-manager.ts](/Users/chengtongxue/Project/_Electron/mini-vscode/src/main/window-manager.ts:41)

开发态：

```ts
mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
```

生产态：

```ts
mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
```

这是正常的 electron-vite 模式。

### 3. `__dirname` 编译后位置变化

当前有两个运行时用法：

- preload 路径： [src/main/window-manager.ts](/Users/chengtongxue/Project/_Electron/mini-vscode/src/main/window-manager.ts:22)
- extension host 入口： [src/main/extensions/extensionHostProcess.ts](/Users/chengtongxue/Project/_Electron/mini-vscode/src/main/extensions/extensionHostProcess.ts:20)

开发源码里 `__dirname` 看起来在 `src/main/**`，但构建后实际在：

```text
out/main
```

打包后又在：

```text
Contents/Resources/app.asar/out/main
```

所以 `__dirname` 适合找构建产物，不适合找可写业务目录。

### 4. 用户配置和状态目前手写 `~/.mini-vscode`

当前配置文件路径：

- [src/main/services/config-service.ts](/Users/chengtongxue/Project/_Electron/mini-vscode/src/main/services/config-service.ts:25)

当前状态文件路径：

- [src/main/services/state-service.ts](/Users/chengtongxue/Project/_Electron/mini-vscode/src/main/services/state-service.ts:17)

这两个目前使用：

```ts
path.join(os.homedir(), '.mini-vscode')
```

它能工作，但不如 Electron/VS Code 风格。更推荐统一到：

```ts
app.getPath('userData')
```

原因：

- 跟应用名/包名绑定；
- macOS 上落到 `Application Support`；
- Windows/Linux 也自动使用平台习惯路径；
- 与生产包权限模型更一致。

### 5. `package.json` 打包配置

当前 `electron-builder` 会把 `out`、`extensions`、`gallery` 放进应用包：

- [package.json](/Users/chengtongxue/Project/_Electron/mini-vscode/package.json:45)

现在配置是：

```json
"files": [
  "out/**/*",
  "extensions/**/*",
  "gallery/**/*"
]
```

这能让生产包读到内置资源，但默认会进入 `app.asar`。适合只读扫描，不适合写入安装目录。

如果希望生产态直接通过真实文件系统访问 gallery/内置扩展，更推荐：

```json
"files": [
  "out/**/*"
],
"extraResources": [
  { "from": "gallery", "to": "gallery" },
  { "from": "extensions", "to": "builtin-extensions" }
]
```

打包后路径会类似：

```text
Contents/Resources/gallery
Contents/Resources/builtin-extensions
```

此时 main 侧可以用：

```ts
const galleryDir = app.isPackaged
  ? path.join(process.resourcesPath, 'gallery')
  : path.join(app.getAppPath(), 'gallery')
```

## 推荐路径分层

建议把扩展路径拆成 3 类：

```ts
const appRoot = app.getAppPath()

const galleryDir = app.isPackaged
  ? path.join(process.resourcesPath, 'gallery')
  : path.join(appRoot, 'gallery')

const builtinExtensionsDir = app.isPackaged
  ? path.join(process.resourcesPath, 'builtin-extensions')
  : path.join(appRoot, 'extensions')

const userExtensionsDir = path.join(app.getPath('userData'), 'extensions')
```

语义：

| 路径 | 作用 | 是否可写 | 开发态 | 生产态 |
| --- | --- | --- | --- | --- |
| `galleryDir` | 本地扩展市场 | 否 | 项目根 `gallery/` | `Contents/Resources/gallery` |
| `builtinExtensionsDir` | 随产品内置扩展 | 否 | 项目根 `extensions/` | `Contents/Resources/builtin-extensions` |
| `userExtensionsDir` | 用户安装扩展 | 是 | `app.getPath('userData')/extensions` | 同左 |

安装动作应该是：

```text
gallery/<id> -> userExtensionsDir/<id>
```

extension host 启动扫描应该至少扫描：

```text
builtinExtensionsDir
userExtensionsDir
```

这样内置扩展和用户安装扩展才不会互相污染。

## VS Code 源码怎么做

VS Code 不是把内置扩展安装到用户目录，而是把“内置扩展”和“用户扩展”分成两套路径。

### 1. VS Code 有独立环境服务

VS Code 的 `NativeEnvironmentService` 统一计算环境路径：

- https://github.com/microsoft/vscode/blob/main/src/vs/platform/environment/node/environmentService.ts

它把 `userDataDir` 交给 `AbstractNativeEnvironmentService`：

```ts
userDataDir: getUserDataPath(args, productService.nameShort)
```

### 2. VS Code 明确区分 appRoot/userDataPath/builtinExtensionsPath/extensionsPath

相关源码：

- https://github.com/microsoft/vscode/blob/main/src/vs/platform/environment/common/environmentService.ts

关键点：

```ts
get appRoot()
get userDataPath()
get builtinExtensionsPath()
get extensionsPath()
```

其中：

- `builtinExtensionsPath` 默认基于应用安装目录旁边的 `extensions`；
- `extensionsPath` 默认基于用户 home 下的产品数据目录；
- 它还支持 CLI 覆盖、`VSCODE_EXTENSIONS`、portable 模式。

这正是我们应该模仿的分层：内置扩展只读，用户扩展可写。

### 3. VS Code 的 userDataPath 有平台规则和覆盖规则

相关源码：

- https://github.com/microsoft/vscode/blob/main/src/vs/platform/environment/node/userDataPath.ts

它支持：

- 开发态 `VSCODE_DEV`；
- portable 模式 `VSCODE_PORTABLE`；
- `VSCODE_APPDATA`；
- CLI `--user-data-dir`；
- macOS 默认 `~/Library/Application Support/<productName>`；
- Linux 默认 `$XDG_CONFIG_HOME/<productName>` 或 `~/.config/<productName>`。

我们不需要完整复制这套复杂度，但至少应该用 `app.getPath('userData')`，不要手写 `~/.mini-vscode`，也不要把用户数据写进 `app.asar`。

### 4. VS Code 的 TypeScript 内置扩展是预构建产物

相关源码：

- https://github.com/microsoft/vscode/blob/main/extensions/typescript-language-features/package.json

关键字段：

```json
"vscode:prepublish": "... compile-extension:typescript-language-features",
"bundle-web": "node ./esbuild.browser.mts",
"main": "./out/extension",
"browser": "./dist/browser/extension"
```

含义：

- 桌面端入口是预编译后的 `out/extension`；
- Web 端入口是 esbuild 打出来的 `dist/browser/extension`；
- 它是随 VS Code 产品发布的 bundled extension，不是在用户点击安装时临时构建；
- 它的 `dependencies` 里没有普通的 `typescript` 依赖字段，TypeScript SDK/tsserver 是产品级资源/内置能力的一部分。

映射到本项目：

```text
ts-language-features 源码目录
  -> build 阶段预构建
  -> 打进 builtin-extensions 或 gallery
  -> 运行时 extension host 只加载编译产物
```

## 对 `ts-language-features` 的建议

当前插件里直接：

```js
const ts = require('typescript')
```

开发态能工作，是因为项目根有 devDependency `typescript`。生产态如果插件目录里没有 `typescript`，就会 `Cannot find module 'typescript'`。

推荐两种路线：

### 路线 A：当前阶段推荐，esbuild bundle 进插件

```text
gallery/ts-language-features/extension.js
  -> esbuild bundle
  -> gallery/ts-language-features/dist/extension.js
```

插件 manifest：

```json
"main": "./dist/extension.js"
```

优点：

- 最容易跑通；
- 不依赖生产包根目录的 `node_modules`；
- 插件是自包含的。

注意：

- 如果同时有 `definitionProvider.js`、`diagnostics.js`、`languageService.js`，bundle 入口要能把这些 `require('./...')` 一起打进去；
- `typescript` 要 bundle 进去，或者明确 external 并把 TypeScript SDK 放到固定产品资源路径。

### 路线 B：更像 VS Code，产品级 TypeScript SDK

```text
Contents/Resources/typescript/lib/typescript.js
Contents/Resources/typescript/lib/tsserver.js
```

插件运行时不再裸 `require('typescript')`，而是通过 main/extension host 注入的产品路径定位 TypeScript SDK。

优点：

- 多个 TS/JS 特性扩展可以共享同一个 SDK；
- 更贴近 VS Code。

缺点：

- 需要设计产品资源路径、版本管理、插件 API；
- 当前项目阶段成本更高。

## 建议改造顺序

1. 新增 main 侧路径工具，统一计算：
   - `galleryDir`
   - `builtinExtensionsDir`
   - `userExtensionsDir`

2. 修改 `ExtensionManagementService`：
   - `listGallery()` 读只读 `galleryDir`
   - `install(id)` 复制到 `userExtensionsDir`
   - `uninstall(id)` 删除 `userExtensionsDir/<id>`

3. 修改 `ExtensionHost.start()` 初始化 payload：
   - 不只传一个 `extensionsDir`
   - 传 `builtinExtensionsDir` 和 `userExtensionsDir`
   - extension host 扫描两套目录

4. 修改 `package.json` 打包配置：
   - `out/**/*` 保持在 `files`
   - `gallery` / `builtin-extensions` 放进 `extraResources`

5. 给 `ts-language-features` 增加构建步骤：
   - 当前推荐 esbuild bundle
   - manifest `main` 指向 bundle 后入口

## 一句话总结

`app.getPath('userData')` 是 Electron 给你的“应用专属可写目录”。VS Code 源码也是把用户数据、用户扩展、内置扩展分开管理；本项目现在的问题是把可写安装目录和只读应用包目录混在了一起。修正方向是：内置资源放 `Resources`，用户安装扩展放 `userData`，TypeScript 插件提前构建成可运行产物。
