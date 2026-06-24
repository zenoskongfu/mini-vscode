import Module, { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { RPCProtocol, type IMessagePassingProtocol } from "../platform/rpc/rpcProtocol";
import {
	ExtHostContext,
	type ExtensionDescription,
	type ExtHostExtensionServiceShape,
} from "../platform/rpc/proxyIdentifiers";
import { ExtHostCommands } from "./extHostCommands";
import { createVSCodeApi } from "./vscode-api";

/**
 * Extension Host entry — runs in an Electron utilityProcess (Node context),
 * fully isolated from the renderer. Mirrors VSCode's extensionHostProcess.
 *
 * Connects to the renderer over a transferred MessagePort, exposes the
 * `vscode` API to extensions via a require('vscode') intercept, scans the
 * builtin extensions dir, and lazily activates extensions on activationEvents.
 */

// Per-extension `vscode` api objects. Each extension gets its own api bound to
// its id (so command registrations are attributable to the owning extension).
// `currentExtensionId` is set around an extension's module load + activate, so
// the require('vscode') intercept can hand back that extension's api.
const extensionApis = new Map<string, Record<string, unknown>>();
let currentExtensionId: string | null = null;

// Intercept `require('vscode')` — exactly how VSCode injects its API.
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

/** What a successfully-activated extension keeps around (for future deactivate) */
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
	/** Successfully activated extensions → their module + context (replaces a bare Set) */
	private readonly _activatedExtensions = new Map<string, ActivationRecord>();
	/** In-flight activations, for re-entrancy protection only */
	private readonly _activating = new Set<string>();
	private _disabled = new Set<string>();

	constructor(
		private readonly extensionsDir: string,
		private readonly rpc: RPCProtocol,
		private readonly extHostCommands: ExtHostCommands
	) {}

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
		this._activating.add(ext.id); // re-entrancy guard while loading/activating
		const context: ActivationRecord["context"] = {
			subscriptions: [],
			extensionPath: ext.extensionPath,
			globalState: new Map<string, unknown>(),
		};
		let mod: ActivationRecord["module"];
		try {
			if (ext.main) {
				// Bind a per-extension `vscode` api, then load the module: its
				// top-level require('vscode') resolves to this extension's api.
				extensionApis.set(ext.id, createVSCodeApi(this.rpc, this.extHostCommands, ext.id));
				currentExtensionId = ext.id;
				const req = createRequire(path.join(ext.extensionPath, "package.json"));
				mod = req(ext.main) as ActivationRecord["module"];
				if (typeof mod?.activate === "function") {
					await mod.activate(context);
					console.log(`[ExtHost] activated ${ext.id}`);
				}
			}
			// Record only on success → a failed activation stays retryable.
			this._activatedExtensions.set(ext.id, { module: mod, context });
		} catch (e) {
			console.error(`[ExtHost] activation failed: ${ext.id}`, e);
			extensionApis.delete(ext.id);
		} finally {
			currentExtensionId = null;
			this._activating.delete(ext.id);
		}
	}
}

// ── Bootstrap: wait for the port + init message from main ──
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

	const extService = new ExtHostExtensionService(init.extensionsDir, rpc, extHostCommands);
	rpc.set(ExtHostContext.ExtHostExtensionService, extService);
	extService.scan();

	console.log("[ExtHost] ready, extensionsDir =", init.extensionsDir);
});
