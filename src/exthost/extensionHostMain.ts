import Module, { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { RPCProtocol, type IMessagePassingProtocol } from "../platform/rpc/rpcProtocol";
import {
	ExtHostContext,
	MainContext,
	type ExtensionDescription,
	type ExtHostExtensionServiceShape,
	type MainThreadCommandsShape,
	type MainThreadExtensionServiceShape,
	type MainThreadMessageShape,
} from "../platform/rpc/proxyIdentifiers";
import { ExtHostCommands } from "./extHostCommands";
import { ExtHostDocuments } from "./extHostDocuments";
import { ExtHostLanguageFeatures } from "./extHostLanguageFeatures";
import { createVSCodeApi } from "./vscode-api";

/**
 * 扩展宿入口 — 运行在 Electron utilityProcess（Node 上下文）中，
 * 与 renderer 完全隔离，对应 VSCode 的 extensionHostProcess。
 *
 * 通过转移过来的 MessagePort 连接 renderer，并通过
 * require('vscode') 拦截向扩展暴露 `vscode` API；同时扫描
 * 内置扩展目录，并按 activationEvents 懒激活扩展。
 */

// 每个扩展独享一个 `vscode` API 对象，API 会绑定到该扩展的
// id（这样命令注册就能追踪到所属扩展）。
// 在加载扩展模块与调用 activate 期间设置 `currentExtensionId`，这样
// require('vscode') 拦截器就能返回对应扩展的 API。
const extensionApis = new Map<string, Record<string, unknown>>();
let currentExtensionId: string | null = null;

// 拦截 `require('vscode')`，这正是 VSCode 注入自身 API 的方式。
const moduleLoad = (Module as unknown as { _load: (...a: unknown[]) => unknown })._load;
(Module as unknown as { _load: (...a: unknown[]) => unknown })._load = function (
	this: unknown,
	request: string,
	...rest: unknown[]
): unknown {
	if (request === "vscode") {
		return (currentExtensionId && extensionApis.get(currentExtensionId)) || {};
	}
	return moduleLoad.call(this, request, ...rest);
};

/** 成功激活的扩展需要保留的信息（供后续 deactivate 使用） */
interface ActivationRecord {
	module: { activate?: (ctx: unknown) => unknown; deactivate?: () => unknown } | undefined;
	context: {
		subscriptions: { dispose(): void }[];
		extensionPath: string;
		globalState: Map<string, unknown>;
	};
}

class ExtHostExtensionService implements ExtHostExtensionServiceShape {
	private _extensions: ExtensionDescription[] = [];
	/** 已成功激活的扩展 → 模块与上下文（替代单纯的 Set） */
	private readonly _activatedExtensions = new Map<string, ActivationRecord>();
	/** 正在进行的激活流程，仅用于防止重入 */
	private readonly _activating = new Set<string>();
	private _disabled = new Set<string>();

	/** renderer 侧 MainThread* 代理（用于反注册命令 / 广播激活态 / 弹通知） */
	private readonly _mainCommands: MainThreadCommandsShape;
	private readonly _mainExtensions: MainThreadExtensionServiceShape;
	private readonly _mainMessage: MainThreadMessageShape;

	constructor(
		private readonly extensionsDir: string,
		private readonly rpc: RPCProtocol,
		private readonly extHostCommands: ExtHostCommands,
		private readonly extHostLanguageFeatures: ExtHostLanguageFeatures
	) {
		this._mainCommands = rpc.getProxy<MainThreadCommandsShape>(MainContext.MainThreadCommands);
		this._mainExtensions = rpc.getProxy<MainThreadExtensionServiceShape>(
			MainContext.MainThreadExtensionService
		);
		this._mainMessage = rpc.getProxy<MainThreadMessageShape>(MainContext.MainThreadMessageService);
	}

	scan(): void {
		this._extensions = [];
		let entries: string[] = [];
		try {
			entries = fs.readdirSync(this.extensionsDir);
		} catch {
			console.warn("[ExtHost] no extensions dir:", this.extensionsDir);
			return;
		}
		for (const name of entries) {
			const dir = path.join(this.extensionsDir, name);
			const manifestPath = path.join(dir, "package.json");
			if (!fs.existsSync(manifestPath)) continue;
			try {
				const m = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
				this._extensions.push({
					id: m.name,
					name: m.name,
					displayName: m.displayName,
					main: m.main,
					activationEvents: m.activationEvents ?? [],
					contributes: m.contributes ?? {},
					extensionPath: dir,
				});
			} catch (e) {
				console.error("[ExtHost] bad manifest", manifestPath, e);
			}
		}
		console.log(
			`[ExtHost] scanned ${this._extensions.length} extension(s):`,
			this._extensions.map((e) => e.id)
		);
	}

	async $getExtensions(): Promise<ExtensionDescription[]> {
		return this._extensions;
	}

	async $rescan(): Promise<ExtensionDescription[]> {
		this.scan();
		return this._extensions;
	}

	async $setDisabledExtensions(ids: string[]): Promise<void> {
		this._disabled = new Set(ids);
	}

	async $activateByEvent(event: string): Promise<void> {
		for (const ext of this._extensions) {
			if (
				this._activatedExtensions.has(ext.id) ||
				this._activating.has(ext.id) ||
				this._disabled.has(ext.id)
			)
				continue;
			if (ext.activationEvents.includes(event) || ext.activationEvents.includes("*")) {
				await this._activate(ext);
			}
		}
	}

	private async _activate(ext: ExtensionDescription): Promise<void> {
		if (this._activatedExtensions.has(ext.id) || this._activating.has(ext.id)) return;
		this._activating.add(ext.id); // 加载/激活期间的重入保护
		this._mainExtensions.$onDidChangeActivation(ext.id, "activating");
		const context: ActivationRecord["context"] = {
			subscriptions: [],
			extensionPath: ext.extensionPath,
			globalState: new Map<string, unknown>(),
		};
		let mod: ActivationRecord["module"];
		try {
			if (ext.main) {
				// 先绑定该扩展专属的 `vscode` API，再加载模块：它的
				// 顶层 require('vscode') 会解析到这个扩展自己的 API。
				extensionApis.set(
					ext.id,
					createVSCodeApi(this.rpc, this.extHostCommands, this.extHostLanguageFeatures, ext.id)
				);
				currentExtensionId = ext.id;
				const req = createRequire(path.join(ext.extensionPath, "package.json"));
				mod = req(ext.main) as ActivationRecord["module"];
				if (typeof mod?.activate === "function") {
					await mod.activate(context);
					console.log(`[ExtHost] activated ${ext.id}`);
				}
			}
			// 只在成功后记录；激活失败的扩展仍可重试。
			this._activatedExtensions.set(ext.id, { module: mod, context });
			this._mainExtensions.$onDidChangeActivation(ext.id, "active");
		} catch (e) {
			console.error(`[ExtHost] activation failed: ${ext.id}`, e);
			extensionApis.delete(ext.id);
			this._mainExtensions.$onDidChangeActivation(ext.id, "failed");
			const msg = e instanceof Error ? e.message : String(e);
			this._mainMessage.$showMessage("error", `扩展 ${ext.id} 激活失败：${msg}`);
		} finally {
			currentExtensionId = null;
			this._activating.delete(ext.id);
		}
	}

	/**
	 * 停用扩展：调 deactivate 钩子 → 逆序释放 subscriptions → 反注册其全部命令
	 * （并通知 renderer 移除）→ 清理该扩展的模块缓存 → 遗忘激活记录。
	 * 失败激活留下的零散状态也一并清理，使「再次安装」从干净状态开始。
	 */
	async $deactivate(id: string): Promise<void> {
		const record = this._activatedExtensions.get(id);

		// 1. deactivate 钩子
		try {
			await record?.module?.deactivate?.();
		} catch (e) {
			console.error(`[ExtHost] deactivate hook failed: ${id}`, e);
		}

		// 2. 逆序释放 context.subscriptions
		if (record) {
			for (const d of [...record.context.subscriptions].reverse()) {
				try {
					d.dispose();
				} catch (e) {
					console.error(`[ExtHost] subscription dispose failed: ${id}`, e);
				}
			}
		}

		// 3. 反注册该扩展注册的所有命令，并通知 renderer 移除
		for (const cmdId of this.extHostCommands.unregisterByExtension(id)) {
			this._mainCommands.$unregisterCommand(cmdId);
		}
		// 3b. 反注册该扩展注册的所有语言特性 provider
		this.extHostLanguageFeatures.unregisterByExtension(id);

		// 4. 清模块缓存（仅该扩展自身路径下的文件，不动外部依赖）
		const prefix = record?.context.extensionPath ?? this._extensions.find((e) => e.id === id)?.extensionPath;
		if (prefix) {
			const cache = (Module as unknown as { _cache: Record<string, unknown> })._cache;
			for (const key of Object.keys(cache)) {
				if (key.startsWith(prefix)) delete cache[key];
			}
		}

		// 5. 遗忘
		extensionApis.delete(id);
		this._activatedExtensions.delete(id);
		if (record) console.log(`[ExtHost] deactivated ${id}`);
	}
}

// ── 启动：等待 main 传来的端口与初始化消息 ──
const parentPort = (
	process as unknown as {
		parentPort: { once(ev: "message", cb: (e: { data: unknown; ports: unknown[] }) => void): void };
	}
).parentPort;

parentPort.once("message", (e) => {
	const init = e.data as { extensionsDir: string };
	// 接受port对象
	const port = e.ports[0] as {
		start(): void;
		postMessage(m: unknown): void;
		on(ev: "message", cb: (ev: { data: unknown }) => void): void;
	};
	port.start();

	// 创建RPC协议实例，使用MessagePort进行通信
	const protocol: IMessagePassingProtocol = {
		send: (m) => port.postMessage(m),
		onMessage: (cb) => port.on("message", (ev) => cb(ev.data)),
	};
	const rpc = new RPCProtocol(protocol);

	const extHostCommands = rpc.set(ExtHostContext.ExtHostCommands, new ExtHostCommands());
	const extHostDocuments = rpc.set(ExtHostContext.ExtHostDocuments, new ExtHostDocuments());
	const extHostLanguageFeatures = rpc.set(
		ExtHostContext.ExtHostLanguageFeatures,
		new ExtHostLanguageFeatures(rpc, extHostDocuments)
	);

	const extService = new ExtHostExtensionService(
		init.extensionsDir,
		rpc,
		extHostCommands,
		extHostLanguageFeatures
	);
	rpc.set(ExtHostContext.ExtHostExtensionService, extService);
	extService.scan();

	console.log("[ExtHost] ready, extensionsDir =", init.extensionsDir);
});
