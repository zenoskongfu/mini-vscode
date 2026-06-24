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

// The api object is (re)assigned after the RPC channel is up; the require
// intercept closes over this binding so extensions get the live api.
let vscodeApi: Record<string, unknown> = {};

// Intercept `require('vscode')` — exactly how VSCode injects its API.
const moduleLoad = (Module as unknown as { _load: (...a: unknown[]) => unknown })._load;
(Module as unknown as { _load: (...a: unknown[]) => unknown })._load = function (
	this: unknown,
	request: string,
	...rest: unknown[]
): unknown {
	if (request === "vscode") return vscodeApi;
	return moduleLoad.call(this, request, ...rest);
};

class ExtHostExtensionService implements ExtHostExtensionServiceShape {
	private _extensions: ExtensionDescription[] = [];
	private readonly _activated = new Set<string>();
	private _disabled = new Set<string>();

	constructor(private readonly extensionsDir: string) {}

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
			if (this._activated.has(ext.id) || this._disabled.has(ext.id)) continue;
			if (ext.activationEvents.includes(event) || ext.activationEvents.includes("*")) {
				await this._activate(ext);
			}
		}
	}

	private async _activate(ext: ExtensionDescription): Promise<void> {
		this._activated.add(ext.id); // mark first to avoid re-entrant double activation
		if (!ext.main) return;
		try {
			const req = createRequire(path.join(ext.extensionPath, "package.json"));
			const mod = req(ext.main) as { activate?: (ctx: unknown) => unknown };
			const context = {
				subscriptions: [] as { dispose(): void }[],
				extensionPath: ext.extensionPath,
				globalState: new Map<string, unknown>(),
			};
			if (typeof mod.activate === "function") {
				await mod.activate(context);
				console.log(`[ExtHost] activated ${ext.id}`);
			}
		} catch (e) {
			console.error(`[ExtHost] activation failed: ${ext.id}`, e);
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
	vscodeApi = createVSCodeApi(rpc, extHostCommands);

	const extService = new ExtHostExtensionService(init.extensionsDir);
	rpc.set(ExtHostContext.ExtHostExtensionService, extService);
	extService.scan();

	console.log("[ExtHost] ready, extensionsDir =", init.extensionsDir);
});
