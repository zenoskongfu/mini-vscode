# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

A mini VSCode clone built to learn Electron + VSCode's internal architecture. It deliberately reimplements VSCode's actual patterns (multi-process isolation, DI container, command registry, extension host over RPC) in a minimal form, so changes should **stay faithful to the VSCode mental model** rather than introduce simpler-but-divergent shortcuts.

## Commands

```bash
pnpm dev                 # electron-vite dev — runs the real Electron app (HMR)
pnpm build               # electron-vite build → out/{main,preload,renderer}
pnpm preview             # browser preview (vite.preview.config.ts) — uses mocked electronAPI, no Electron
pnpm package             # electron-builder → dist/ (dmg on mac)
pnpm rebuild:native      # rebuild node-pty for Electron's ABI (also runs on postinstall)
```

There is **no test runner and no linter configured**. "Verification" in this project = run `pnpm dev` and check behavior + console logs. Type-check via the IDE / `tsc -b` against the project references (`tsconfig.node.json`, `tsconfig.web.json`).

Use `pnpm` (v10, see `packageManager`). `.npmrc` sets `ignore-scripts=false` + `approve-builds[]` so native install scripts run — do not remove these or node-pty won't build.

## The four processes

```
main (Node, full privilege)
 ├─ preload (contextBridge) ──→ renderer (React, sandboxed: contextIsolation=true, nodeIntegration=false)
 └─ extensionHost (utilityProcess, Node) ←── MessageChannel ──→ renderer
```

- **main** (`src/main/`): owns filesystem truth, terminal (node-pty), config, window. Exposes capabilities to the renderer only through `IPCRouter` (`ipc-router.ts`). Also spawns the extension host and *brokers a MessagePort pair* between ext host and renderer — after handoff, main is **not** in the ext-host↔renderer data path.
- **preload** (`src/preload/`): the only bridge. Builds `window.electronAPI` via `contextBridge` and re-posts the transferred ext-host port into the main world. The renderer must never `import` Node modules (`fs`, `node-pty`, …) — that's the whole point of the sandbox.
- **renderer** (`src/renderer/`): the workbench. This is where most code lives. In VSCode terms the renderer is the **"main thread"** — `MainContext.MainThread*` shapes are implemented *here*, not in the Electron main process.
- **extensionHost** (`src/exthost/`, built from a separate vite entry → `out/main/extensionHost.js`): runs extension `extension.js` code in isolation with a fake `vscode` API (`vscode-api.ts`).

### IPC vs push
Renderer→main request/response goes through `window.electronAPI.*` → `ipcMain.handle` (async, structured-clone only — no functions/class instances). High-frequency streams (terminal data, file-watch events via chokidar) use one-way `webContents.send` push, **not** `invoke` — see `terminal-service.ts` and `fs:onChange`. Filesystem truth lives in main; the renderer holds a *subscribed copy* that can be briefly stale.

## Renderer architecture (the core)

The renderer is built on four VSCode pillars. Read these before touching renderer code:

1. **DI container** (`src/renderer/instantiation/`). Services are injected, never `new`ed. The trio: `createDecorator` (makes an identifier that is *also* a parameter decorator and *also* the DI key — "三位一体") → `ServiceCollection` → `InstantiationService`. Dependencies are stored on a constructor static field by the decorator at runtime, **not** via reflect-metadata. This is intentional: it's why the project compiles under esbuild with only `experimentalDecorators` and **no** `emitDecoratorMetadata` (esbuild can't emit `design:paramtypes`). Inject by interface: `constructor(@ICommandService private cs: ICommandService)`.

2. **Services + singleton registration** (`src/renderer/services/`). Each service module calls `registerSingleton()` as an import side-effect; `platform/bootstrap.ts` imports them all and builds the root `InstantiationService` from `getSingletonServiceDescriptors()`. Services are **lazy** — instantiated on first `get()`. **To add a service: create it with `registerSingleton`, then add its import to `bootstrap.ts`** or it won't exist.

3. **Reactive state via Emitter/Event** (`base/event.ts`). State lives in services, not React `useState`. A service holds state + `fire()`s an `Emitter` on change. `Event<T>` is a *subscribe function*, not an object; events are often bare signals (`onDidChangeTabs: Event<void>`) — listeners then `get` the fresh value. React projects this via `useService` + `useEvent` (`platform/`).
   - ⚠️ **`useEvent` reference-stability trap**: the `getValue` selector must return the *same reference* when nothing changed (e.g. return `service.tabs`, never `[...service.tabs]`) or you get an infinite re-render loop.

4. **Command registry** (`services/commands/commandService.ts`). `commandId` is the "middle currency". Triggers (keybindings, command palette, menus, extensions) only know the id; implementers register a handler. Everything funnels through `executeCommand(id, ...args)`. Wire new commands in `workbench/contrib/registerContributions.ts` (`registerCommand` + optional `registerKeybinding(chord, id)`). KeybindingService stores `Map<chord, commandId>` and never touches handlers.

**Disposable discipline** (`base/lifecycle.ts`): every register/listen returns an `IDisposable`; bind child lifetimes with `DisposableStore` / `_register`. When you write `addEventListener` or `emitter.event(...)`, immediately decide how it's disposed. Extensions clean up via `context.subscriptions`.

**Monaco**: editor models are singletons keyed by path (preserves undo/cursor/scroll across tabs). The content *truth* lives in `EditorService` (`dirty = content !== savedContent`), not the component — never rebuild the Monaco instance on render.

## Extension system & RPC

The ext host ↔ renderer link is a proxy-based RPC (`src/platform/rpc/`), shared by both ends:
- `proxyIdentifiers.ts` defines the interface shapes. `MainContext.MainThread*` = implemented in the **renderer**; `ExtHostContext.ExtHost*` = implemented in the **ext host**. Cross-boundary methods use the `$method` naming convention.
- `rpcProtocol.ts` turns these into bidirectional proxies over the MessagePort.
- Flow example: extension calls `vscode.commands.executeCommand('x')` → `ExtHostCommands` → RPC → `MainThreadCommands.$executeCommand` → renderer's `CommandService.executeCommand` → same path any built-in command takes.
- Extensions: built-ins in `extensions/`, installable gallery in `gallery/` (each is `package.json` + `extension.js` with `contributes.commands` / `activationEvents`).

## Dual-run mode & build fragility

Two runtime targets: **real Electron** (preload injects the real `electronAPI`) and **browser preview** (`mocks/electron-api-mock.ts` injects a fake one — preload can't run outside Electron). Known landmines (all documented in `docs/`):
- **Decorators**: `electron-vite dev`'s `optimizeDeps` scanner uses a separate esbuild instance that ignores `renderer.esbuild.tsconfigRaw`, so the config *also* points `optimizeDeps.esbuildOptions.tsconfig` at `tsconfig.web.json`. Both knobs are required.
- **React must be deduped** (`resolve.dedupe`) or Allotment throws "Invalid hook call".
- **Allotment** measures in pixels; a panel starting `visible=false` collapses layout → fixed with deferred `useLayoutEffect`.
- **node-pty** is native (compiled to Electron's ABI 146, ≠ local Node's). Main-process only + externalized; `postinstall`/`rebuild:native` rebuild it. If it `require`-crashes with a NODE_MODULE_VERSION error, run `pnpm rebuild:native`. Full saga in `docs/node-pty-native-build.md`.

"Compiles" ≠ "runs" here — decorators, singletons, native ABI, and layout measurement only fail at runtime.

## Reference docs

`docs/` holds detailed Chinese architecture notes — consult before deep changes:
- `architecture-notes.md` — the 10 key concepts (process model, IPC, DI, events, commands, …)
- `di-and-decorators.md` — command decoupling + why `emitDecoratorMetadata` is avoided
- `node-pty-native-build.md` — the native-module build checklist
