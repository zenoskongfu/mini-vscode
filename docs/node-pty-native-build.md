# 专题：node-pty 的 native 编译坑（Phase 5）

> 集成终端用 node-pty 跑真实 shell。node-pty 是 **native 模块**（C++ 编译成 `.node`），在 Electron 里用它会踩一连串编译/加载坑。这份文档把本项目实际遇到并解决的问题沉淀下来。

## 背景：为什么 native 模块在 Electron 里特别麻烦

native 模块（`.node` 文件）是针对**特定 ABI** 编译的二进制。关键事实：

> **Electron 内置的 Node ABI 与你本机的 Node ABI 不同。**

- 本机 `node -v` = v22 → ABI（`process.versions.modules`）= **127**
- Electron 42 内置的 Node → ABI = **146**

所以"给 Node 编译的 node-pty"直接拿到 Electron 里 `require`，会抛：

```
Error: The module was compiled against a different Node.js version using
NODE_MODULE_VERSION 127. This version of Node.js requires NODE_MODULE_VERSION 146.
```

这是所有 Electron + native 模块项目的头号坑。

---

## 本项目的选择与实际经历

计划阶段在两个方案里选了**预编译包**（图省事）：

| 方案 | 思路 | 结果 |
|---|---|---|
| 原生 `node-pty` + `@electron/rebuild` | 装源码包，针对 Electron ABI 现场编译 | 兜底方案 |
| `@homebridge/node-pty-prebuilt-multiarch` | 预编译包，按平台下载现成 `.node` | **首选** |

但实际跑下来，预编译方案**也没省到事**——下面是完整的踩坑链。

### 坑 1：pnpm 默认拦截 native 包的 install 脚本

```
Ignored build scripts: @homebridge/node-pty-prebuilt-multiarch.
Run "pnpm approve-builds" to pick which dependencies should be allowed to run scripts.
```

pnpm 出于安全默认**不执行**依赖的 install/postinstall 脚本（防供应链攻击）。而 native 包正是靠 install 脚本去下载/编译二进制的——被拦了就没有 `.node`。

**解决**：在 `.npmrc` 显式批准：
```ini
ignore-scripts=false
approve-builds[]=esbuild
approve-builds[]=@homebridge/node-pty-prebuilt-multiarch
```

### 坑 2：预编译包按 Node 下载，不是按 Electron

prebuild-install 默认按**当前运行时**（node v22）拉预编译，拉到的是 ABI 127 的二进制——拿到 Electron（ABI 146）里照样崩。要按 Electron 拉得显式指定 runtime/target：

```bash
npx prebuild-install --runtime=electron --target=42.4.1 \
  --dist-url=https://electronjs.org/headers --arch=arm64
```

### 坑 3：预编译包根本没有 Electron 42 的二进制（404）

```
prebuild-install http 404 .../node-pty-prebuilt-multiarch-v0.13.1-electron-v146-darwin-arm64.tar.gz
prebuild-install warn install No prebuilt binaries found
  (target=42.4.1 runtime=electron arch=arm64 platform=darwin)
```

Electron 42 太新，预编译包的 GitHub releases 还没发布对应 ABI（v146）+ 平台（darwin-arm64）的二进制。**"预编译省事"的前提是上游真的发布了你那套组合的二进制**——版本太新就落空，被迫回到源码编译。

> 教训：选预编译包时，先确认它对你的 **Electron 版本 + 平台 + 架构** 有现成二进制，否则并不比原生方案省事。

### 坑 4：回退源码编译——用 @electron/rebuild 兜底

预编译 404 后，唯一出路是源码编译。手动 node-gyp 要自己配 Electron headers/ABI 很烦，`@electron/rebuild` 把这些自动化了（它从 devDependencies 读 Electron 版本）：

```bash
pnpm add -D @electron/rebuild
npx electron-rebuild -f -w @homebridge/node-pty-prebuilt-multiarch
# ✔ Rebuild Complete
```

前提：本机有 C++ 工具链（macOS 的 Xcode Command Line Tools / `xcode-select --install`）。本项目机器已具备，所以源码编译成功，产物落在：
```
node_modules/@homebridge/node-pty-prebuilt-multiarch/build/Release/pty.node   # ABI 146
```

### 坑 5：每次 install 后都要重新 rebuild（容易忘）

pnpm 用符号链接到内容寻址 store，且默认忽略 build 脚本——意味着每次 `pnpm install` 后那份"对 Electron 编译过"的 `.node` 可能没了或没重建。忘记重建 = 下次启动又 ABI 崩溃。

**解决**：加 `postinstall` 自动重建（[package.json](../package.json)）：
```json
"scripts": {
  "rebuild:native": "electron-rebuild -f -w @homebridge/node-pty-prebuilt-multiarch",
  "postinstall": "electron-rebuild -f -w @homebridge/node-pty-prebuilt-multiarch"
}
```

### 坑 6：node-pty 只能在主进程，且要 externalize

native 模块不能被打进 renderer 的浏览器 bundle。本项目里：
- node-pty 只在**主进程** [terminal-service.ts](../src/main/services/terminal-service.ts) `import`
- electron-vite 的 `externalizeDepsPlugin()` 已自动把它 externalize（从 node_modules 运行时加载，不打包）
- renderer 侧只通过 IPC 间接用终端，绝不直接 import node-pty

### 坑 7（连带）：electron-vite dev 的 optimizeDeps 扫描器与装饰器

这条不是 node-pty 本身，但和 Phase 5 一起暴露——记在这里：

`electron-vite build` 能过、`pnpm dev` 却报：
```
✘ [ERROR] Parameter decorators only work when experimental decorators are enabled
```

原因：dev 模式下 Vite 的 **optimizeDeps 依赖扫描器**用的是独立 esbuild 实例，**不读** renderer 配的 `esbuild.tsconfigRaw`，而它扫描源码时撞上了 DI 的参数装饰器。

**解决**（[electron.vite.config.ts](../electron.vite.config.ts)）：给扫描器单独指定带 `experimentalDecorators` 的 tsconfig：
```ts
optimizeDeps: {
  esbuildOptions: { tsconfig: resolve(__dirname, 'tsconfig.web.json') }
}
```

---

## 如何验证 native 模块真的能用

不要等接完 UI 才发现 `require` 崩。本项目的做法是**先写最小 smoke 在 Electron 上下文跑通再接 UI**：

```js
// pty-smoke.cjs —— npx electron pty-smoke.cjs
const { app } = require('electron')
app.whenReady().then(() => {
  const pty = require('@homebridge/node-pty-prebuilt-multiarch') // 不崩 = ABI 对了
  const p = pty.spawn(process.env.SHELL || '/bin/bash',
    ['-lc', 'echo hello-from-pty && exit'], { cwd: process.cwd(), env: process.env })
  let out = ''
  p.onData(d => { out += d })
  p.onExit(() => { console.log(out.includes('hello-from-pty') ? 'PASS' : 'FAIL'); app.exit(0) })
})
```

> 注意：因为编译目标是 Electron ABI（146），这个 smoke 只能用 `npx electron` 跑，用普通 `node` 跑会 ABI 不匹配报错。

本项目实跑结果：`SMOKE: require OK / pty output = "hello-from-pty" / PASS`，确认二进制可用后才往下做。最终在真实 app 里日志验证了完整链路：渲染层 → IPC → 主进程 `node-pty` spawn 真实 `/bin/zsh` → 输出经 `terminal:data` 回推。

---

## 速查清单（下次遇到 Electron + native 模块）

1. **先确认 ABI**：`node -p "process.versions.modules"`（本机）对比 Electron 的；不一致就必须重编译
2. **pnpm 先批准脚本**：`.npmrc` 加 `approve-builds[]=<包名>`
3. **优先查预编译是否覆盖你的组合**：Electron 版本 + 平台 + 架构都要有现成二进制，否则不省事
4. **没有就用 `@electron/rebuild`**：需本机 C++ 工具链（mac: Xcode CLT）
5. **加 `postinstall` 自动重建**：防 install 后忘记
6. **native 只在主进程 + externalize**：绝不进 renderer bundle
7. **先 smoke 再接 UI**：在 `npx electron` 里验证 `require` + spawn
```
