# 专题：命令解耦 与 emitDecoratorMetadata

> 两个 Phase 4 / Phase 3.5 反复讲过的核心专题，单独成篇。

---

## 一、命令与快捷键的"间接层"解耦

### 一句话本质
**`commandId` 是一种"中间货币"。** 谁想触发某个行为，不直接拿那个函数，而是喊出它的 id；谁想提供行为，把 id 注册到一张表里。触发方和实现方互相不认识，只认识 id。

```
                        ┌─────────────────────────┐
  触发者(谁来调)         │   CommandService (id表)  │   实现者(干什么)
                        │  Map<id, handler>        │
  快捷键 ⌘⇧P ─┐         │                          │
  命令面板    ─┼─ id ──▶ │  executeCommand(id) ───▶ handler() ─▶ 调 LayoutService 等
  菜单(未来)  ─┤         │                          │
  插件(未来)  ─┘         └─────────────────────────┘
```

### 不解耦会怎样（反例）
```ts
// ❌ 紧耦合：快捷键直接调函数
document.addEventListener('keydown', e => {
  if (cmd && shift && e.key === 'b') layoutService.toggleSidebar()
})
```
问题：命令面板要再写一遍同样调用；改键位要改 if；插件拿不到 `layoutService` 没法触发；想加日志/权限每个分支都要改。**同一个行为散落在 N 个触发点。**

### 解耦后：一处实现，多处触发
见 [../src/renderer/workbench/contrib/registerContributions.ts](../src/renderer/workbench/contrib/registerContributions.ts) 的 `register()`：
```ts
commandService.registerCommand({ id, title, category, handler })  // ① 行为登记到表
if (chord) keybindingService.registerKeybinding(chord, id)        // ② 键位只记 id，不记 handler
```
KeybindingService 存的是 `Map<chord, commandId>`，全程不碰 handler。按键流程：
```
keydown → eventToChord → 查 _chordToCommand 得 id → commandService.executeCommand(id)
```
它只是个"把按键翻译成 id 并转交"的翻译官，完全不知道 `toggleSidebar` 是什么。

### 三类角色
| 角色 | 代码 | 知道什么 |
|---|---|---|
| **行为登记表**（唯一权威） | `CommandService` | id ↔ handler 全部映射 |
| **触发者**（多个，可无限加） | KeybindingService、CommandPalette、(菜单/插件) | 只知道 id |
| **实现者**（业务） | handler 内部调 LayoutService/EditorService… | 只管干活，不管被谁触发 |

### 5 个收益
1. **多入口零成本**：再加触发方式只要 `executeCommand(id)`，实现一行不动。
2. **可重绑定**：改键位本质是改 `_chordToCommand` 这张 Map，handler 不知情（对应 VSCode 的 keybindings.json）。
3. **可编程/可被插件调用**：执行入口收敛成 `executeCommand(id, ...args)`。Phase 6.5 插件里 `vscode.commands.executeCommand('...')` 跨进程 RPC 过来，最终走同一入口。
4. **统一切面**：所有命令过 `executeCommand` 这一个咽喉，加日志/`when` 上下文/权限/telemetry 只改一处。
5. **UI 自描述**：id↔title、id↔chord 是数据，面板能反查 `lookupKeybinding(id)` 显示 "⌘⇧P"。

### 心智模型
> **Command = "做什么"（语义），Keybinding/Palette/Menu = "怎么触发"（入口）。** 把"做什么"做成可寻址的命名实体（id），"怎么触发"就能无限扩展而不影响"做什么"。

这是 **Command 模式 + 注册表/服务定位** 的极致贯彻。VSCode 把菜单项、快捷键、命令面板、右键菜单、插件 API、`tasks.json` 全部最终落到 `executeCommand(id)`。Phase 4 这 100 行就是那套体系的最小内核。

---

## 二、emitDecoratorMetadata 专题

### 它是什么
`emitDecoratorMetadata` 是 TS 编译选项（须配合 `experimentalDecorators`）。开启后编译器给被装饰声明额外 emit **运行时类型元数据**，通过 `Reflect.metadata(...)` 写入（需 `reflect-metadata` polyfill）。最关键的是 `design:paramtypes`：**把构造函数参数类型作为运行时的值记录下来**。

Angular / NestJS / TypeORM / InversifyJS 全靠它：你写 `constructor(private foo: FooService)`，框架用 `Reflect.getMetadata('design:paramtypes', Ctor)` 读出 `[FooService]`——"类型注解本身"成了依赖信息。

### 本项目为何"主动绕开"
见 [../src/renderer/instantiation/instantiation.ts](../src/renderer/instantiation/instantiation.ts)：依赖信息是**装饰器自己手动存**的。`@ICommandService` 被调用时执行 `storeServiceDependency(id, target, index)`，把 `{ id, index }` 记到构造函数静态字段。依赖信息来自**装饰器的运行时调用**，不需要编译器 emit 类型元数据。这正是 VSCode 的做法——刻意避开 reflect-metadata。

### 决定性细节：我们按"接口"注入
```ts
constructor(@ICommandService private readonly commandService: ICommandService) {}
```
`ICommandService` 是 **interface**，TypeScript 接口**没有任何运行时存在**（编译后彻底擦除）。所以即便开了 `emitDecoratorMetadata`，给这个参数 emit 的 `design:paramtypes` 也只是个没用的 `Object`。

> **因为我们按接口注入，reflect-metadata 那套从原理上就帮不了我们。** 唯一可行方案是让"标识符即装饰器即 token"——`ICommandService` 这个值同时是：① 类型（同名 interface）、② 参数装饰器、③ DI 查表的 key。三位一体正是 VSCode DI 的精髓，也是它不需要 emitDecoratorMetadata 的根本原因。

### 与 esbuild/Vite 兼容性的强绑定
- esbuild（Vite 底层）**支持** `experimentalDecorators`（legacy 参数装饰器）→ 我们的 `@IService` 能编译。
- esbuild **不支持** `emitDecoratorMetadata` → 因为 emit `design:paramtypes` 需要完整的类型检查器把类型解析成运行时值，而 esbuild 只是转译器，不做类型分析。

所以假如当初用 Angular/Nest 那种 reflect-metadata 式 DI，**在 esbuild/Vite 下根本编译不出来**，得换 tsc / swc(带插件) / babel。VSCode（和我们）的"装饰器手动存依赖"设计天生兼容非类型感知的转译器——这是刻意选择。

### 对照表
| | reflect-metadata 式 DI（Angular/Nest） | 本项目 / VSCode DI |
|---|---|---|
| 依赖信息来源 | 编译器 emit 的 `design:paramtypes` | 装饰器运行时手动 `storeServiceDependency` |
| 需 `emitDecoratorMetadata` | ✅ 需要 | ❌ 不需要 |
| 需 `reflect-metadata` polyfill | ✅ 需要 | ❌ 不需要 |
| 能按裸 interface 注入 | ❌（接口被擦除→`Object`） | ✅（标识符即 token） |
| esbuild/Vite 直接可用 | ❌ | ✅ |

### 配置佐证
- [../tsconfig.web.json](../tsconfig.web.json) → `experimentalDecorators: true`，**无** `emitDecoratorMetadata`
- [../electron.vite.config.ts](../electron.vite.config.ts) → `renderer.esbuild.tsconfigRaw.compilerOptions.experimentalDecorators: true`（Vite 不一定跟随 tsconfig project references，故显式再设一遍）
- [../vite.preview.config.ts](../vite.preview.config.ts) → 预览环境同样设置

### 一句话总结
> 本项目和 emitDecoratorMetadata 的关系是"**主动绕开**"——靠"装饰器即 token、手动登记依赖"的设计，既支持按接口注入，又让整条 esbuild/Vite 构建链得以成立。
