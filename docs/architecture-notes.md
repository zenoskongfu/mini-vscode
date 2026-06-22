# Mini VSCode 架构学习笔记（Phase 1~4）

> 这份文档把项目搭建过程中讲过的架构要点沉淀下来，方便边看代码边复习，也给后续 phase 留索引。

## 架构主线

把整个项目读成一条单向数据流，再叠加两层"间接"：

```
源数据(主进程 / 服务)  ──事件通知──▶  视图(React)
        ▲                                 │
        └──────── 命令 / DI 两层间接 ──────┘
```

- **源数据**：文件系统真相在主进程；UI/编辑器/工作区状态在各个 Service 类里
- **事件通知**：Service 持有状态 + `Emitter` 通知（push 模型），不是双向绑定
- **视图**：React 组件通过 `useService` + `useEvent` 把服务状态"投影"出来
- **两层间接**：
  - **DI**：组件/服务不自己 `new` 依赖，靠 `InstantiationService` 注入
  - **命令**：触发者(快捷键/面板/菜单/插件)只认 `commandId`，不认 handler

Phase 1-4 已经把 VSCode 的四大支柱搭起来：**进程隔离 + 服务/DI + 事件响应式 + 命令中枢**。后续所有功能都是往这骨架上挂肉。

---

## 10 个需要注意 / 学习的点

### 1. 三进程模型与安全边界（Phase 1 根基）
- **是什么**：main（Node 全权）/ preload（桥）/ renderer（网页沙箱）。`contextIsolation: true` + `nodeIntegration: false`，renderer 唯一通道是 preload 用 `contextBridge` 暴露的 `window.electronAPI`。
- **代码**：[../src/main/window-manager.ts](../src/main/window-manager.ts)、[../src/preload/index.ts](../src/preload/index.ts)
- **要内化**：为什么不图省事开 `nodeIntegration`——否则任意网页代码就能 `require('fs')` 删硬盘。这是 Electron 安全模型的全部意义。
- **自测**：尝试在某个 renderer 组件里直接 `import fs from 'fs'`，看它报错/打包失败，体会沙箱边界。

### 2. IPC 是异步 + 序列化的（Phase 2）
- **是什么**：每个 `window.electronAPI.fs.xxx()` 都跨进程，必返回 Promise，参数/返回值必须能结构化克隆（不能传函数、类实例、DOM）。
- **代码**：[../src/main/ipc-router.ts](../src/main/ipc-router.ts)、[../src/preload/index.ts](../src/preload/index.ts)
- **要内化**：跨进程的东西天生异步且"哑数据"。`FileNode` 设计成纯数据对象正因如此。频繁小调用有 round-trip 开销——Phase 5 终端高频数据流不能用 `invoke`，要用单向 push（`webContents.send`）。

### 3. 真相在主进程、渲染层是订阅副本（Phase 2）
- **是什么**：文件树权威数据在主进程 fs，渲染层拿到的是快照，靠 chokidar → `fs:onChange` 推送保持同步。
- **代码**：[../src/main/services/file-system-service.ts](../src/main/services/file-system-service.ts)、[../src/renderer/components/explorer/useDirectoryChildren.ts](../src/renderer/components/explorer/useDirectoryChildren.ts)
- **要内化**："单一数据源 + 订阅视图"贯穿全项目。也要意识到副本会短暂过期（删文件那一刻树还没刷新）——分布式状态的固有问题。

### 4. DI 三件套协作 + 懒实例化（Phase 3.5 核心）
- **是什么**：`createDecorator`(造标识符+参数装饰器) → `ServiceCollection`(id→实例/描述) → `InstantiationService`(读构造函数元数据递归注入)。`SyncDescriptor` 首次 `get()` 才 `new`。
- **代码**：[../src/renderer/instantiation/](../src/renderer/instantiation/)
- **要内化**：依赖信息存在构造函数静态字段（不靠 reflect-metadata），所以 esbuild 只需 `experimentalDecorators` 就能跑（详见 [di-and-decorators.md](./di-and-decorators.md)）。
- **自测**：在某 service 构造函数加 `console.log`，看它在"第一次被用到"时才打印——理解 lazy。

### 5. Emitter/Event 是 push 式响应式心脏（Phase 3.5）
- **是什么**：服务持有状态 + 变更时 `fire()`。`Event<T>` 是个"订阅函数"，不是对象。
- **代码**：[../src/renderer/base/event.ts](../src/renderer/base/event.ts)
- **要内化**：流向是 `状态变 → fire → 监听者被叫醒 → 监听者自己去 get 最新值`。事件常只是"信号"（如 `onDidChangeTabs: Event<void>`），不带数据。和 React props 下传方向相反。

### 6. 服务边界 vs React 边界（Phase 3.5）
- **是什么**：业务状态住在 Service（React 之外，任何服务/命令都能访问）；`useService` + `useEvent` 只是把服务状态"投影"进 React。
- **代码**：[../src/renderer/platform/ServicesContext.tsx](../src/renderer/platform/ServicesContext.tsx)、[../src/renderer/platform/useEvent.ts](../src/renderer/platform/useEvent.ts)
- **要内化**：不要把业务状态塞进 `useState`。⚠️ `useEvent` 的引用稳定性陷阱——`getValue` 没变化时必须返回同一引用，否则死循环。
- **自测**：把 `() => editorService.tabs` 改成 `() => [...editorService.tabs]`，复现无限重渲染。

### 7. Monaco model 生命周期（Phase 3）
- **是什么**：model 按 path 单例，切 tab 保留 undo/光标/滚动；live content 存在 `EditorService` 而非组件，`dirty = content !== savedContent`。
- **代码**：[../src/renderer/services/editor/editorService.ts](../src/renderer/services/editor/editorService.ts)、[../src/renderer/components/editor/MonacoEditor.tsx](../src/renderer/components/editor/MonacoEditor.tsx)
- **要内化**：Monaco 是"受控但自带庞大内部状态"的重组件，绝不能每次渲染重建。"内容真相"放服务、"编辑器实例"当视图——和第 3 点同一个哲学。

### 8. Disposable 纪律（Phase 3.5+）
- **是什么**：任何"注册/监听"都返回 `IDisposable`，用 `DisposableStore`/`_register` 把子资源生命周期绑到父对象。
- **代码**：[../src/renderer/base/lifecycle.ts](../src/renderer/base/lifecycle.ts)、范例 [../src/renderer/services/keybinding/keybindingService.ts](../src/renderer/services/keybinding/keybindingService.ts)（document 监听器包成 disposable）
- **要内化**：防内存泄漏的铁律。Phase 5（终端进程）、6.5（插件卸载靠 `context.subscriptions` 一次性 dispose）重度依赖。习惯：写 `addEventListener`/`emitter.event(...)` 的同时就想"它怎么注销"。

### 9. 命令 id = 中间货币，一切收敛到 executeCommand（Phase 4）
- **是什么**：触发者（快捷键/面板/菜单/插件）只认 id，实现者只管干活，中间隔一张 `CommandService` 表。所有执行收敛到 `executeCommand(id)`。
- **代码**：[../src/renderer/services/commands/commandService.ts](../src/renderer/services/commands/commandService.ts)、[../src/renderer/services/keybinding/keybindingService.ts](../src/renderer/services/keybinding/keybindingService.ts)
- **要内化**：这是 Phase 6.5 插件系统的接口契约——插件调内置命令、内置调插件命令，全靠这层抽象。详见 [di-and-decorators.md](./di-and-decorators.md)。

### 10. 双轨运行 + 构建链脆弱点
- **是什么**：两套运行环境——真实 Electron（preload 注入真 API）vs 浏览器预览（mock 注入假 API）。
- **代码**：[../src/renderer/mocks/electron-api-mock.ts](../src/renderer/mocks/electron-api-mock.ts)、[../electron.vite.config.ts](../electron.vite.config.ts)、[../vite.preview.config.ts](../vite.preview.config.ts)
- **要内化**：为什么需要 mock（preload 只在 Electron 里跑）。踩过的三个坑：
  - esbuild 不支持 `emitDecoratorMetadata`（详见专题文档）
  - React 必须 `dedupe` 单例，否则 Allotment 报 "Invalid hook call"
  - Allotment 用像素测量，初始 `visible=false` 会布局塌陷 → 靠 `useLayoutEffect` 延迟应用
- **要内化**："能编译" ≠ "能运行"——装饰器、单例、测量这些坑都只在运行时暴露。

---

## 一条主线收尾

> 把它读成 `源数据(主进程/服务) → 事件通知 → 视图(React)` 的单向数据流，再叠加 `命令/DI 两层间接` 实现可扩展。

延伸阅读：[di-and-decorators.md](./di-and-decorators.md) —— 命令解耦 & emitDecoratorMetadata 两个专题。
