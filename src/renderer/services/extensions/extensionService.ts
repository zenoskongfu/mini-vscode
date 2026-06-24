import { createDecorator } from "../../instantiation/instantiation";
import { registerSingleton } from "../../instantiation/extensions";
import { Emitter, Event } from "../../base/event";
import type { IDisposable } from "../../base/lifecycle";
import { RPCProtocol, type IMessagePassingProtocol } from "../../../platform/rpc/rpcProtocol";
import {
	MainContext,
	ExtHostContext,
	type MainThreadCommandsShape,
	type MainThreadMessageShape,
	type MainThreadExtensionServiceShape,
	type ExtHostExtensionServiceShape,
	type ExtHostCommandsShape,
	type ExtensionDescription,
} from "../../../platform/rpc/proxyIdentifiers";
import { extHostPortPromise } from "../../platform/extHostPort";
import { ICommandService } from "../commands/commandService";
import { INotificationService, type NotificationSeverity } from "../notification/notificationService";
import { IStorageService, StorageScope } from "../storage/storageService";

export interface GalleryItem {
	id: string;
	displayName: string;
	description: string;
	publisher: string;
	version: string;
}

/**
 * 扩展的瞬时状态（中间态）。
 * - installing/uninstalling 由 renderer 操作驱动；
 * - activating/active/failed 由扩展宿主经 $onDidChangeActivation 广播。
 */
export type ExtensionStatus = "idle" | "installing" | "uninstalling" | "activating" | "active" | "failed";

/** 扩展侧边栏使用的合并视图模型 */
export interface ExtensionViewModel {
	id: string;
	displayName: string;
	description: string;
	publisher: string;
	version: string;
	installed: boolean;
	enabled: boolean;
	status: ExtensionStatus;
}

export interface IExtensionService {
	readonly _serviceBrand: undefined;

	/** 安装/启用状态变化时触发 */
	readonly onDidChangeExtensions: Event<void>;

	/** 连接扩展宿主并注册扩展贡献的命令；启动时调用一次 */
	start(): Promise<void>;

	/** gallery + 已安装 + 已启用状态，合并后供扩展视图使用 */
	getViewModels(): ExtensionViewModel[];

	install(id: string): Promise<void>;
	uninstall(id: string): Promise<void>;
	setEnabled(id: string, enabled: boolean): Promise<void>;
}

export const IExtensionService = createDecorator<IExtensionService>("extensionService");

const DISABLED_KEY = "extensions.disabled";

/**
 * ExtensionService（renderer）：既是 ext-host RPC 的“主线程”侧，
 * 也是 Extensions 视图使用的扩展管理表面。
 *
 * 它持有 RPC 连接、已安装扩展描述、禁用集合（持久化），
 * 以及每个扩展的命令注册（这样禁用/卸载时可以干净注销）。
 */
export class ExtensionService implements IExtensionService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeExtensions = new Emitter<void>();
	readonly onDidChangeExtensions = this._onDidChangeExtensions.event;

	private _extHostExtensions!: ExtHostExtensionServiceShape;
	private _extHostCommands!: ExtHostCommandsShape;

	private _gallery: GalleryItem[] = [];
	private _installed: ExtensionDescription[] = [];
	private _disabled = new Set<string>();
	/** 缓存后的合并视图模型；只在变化时重算，确保 getViewModels()
	 *  在两次变化之间保持引用稳定（useSyncExternalStore 要求如此）。 */
	private _viewModels: ExtensionViewModel[] = [];

	/** id → 该扩展注册命令对应的 disposable 集合 */
	private readonly _commandDisposables = new Map<string, IDisposable[]>();

	/** 扩展宿主运行时动态注册（非 manifest 贡献）的命令 → disposable */
	private readonly _dynamicCommandDisposables = new Map<string, IDisposable>();

	/** id → 瞬时状态（中间态）；缺省视为 idle */
	private readonly _status = new Map<string, ExtensionStatus>();

	constructor(
		@ICommandService private readonly commandService: ICommandService,
		@INotificationService private readonly notificationService: INotificationService,
		@IStorageService private readonly storageService: IStorageService
	) {}

	async start(): Promise<void> {
		this._disabled = new Set(this.storageService.getObject<string[]>(DISABLED_KEY, StorageScope.GLOBAL, []));

		// 先加载 gallery；即使没有扩展宿主也能工作，因此 Extensions
		// 视图可以立即渲染（浏览器预览没有端口，也能显示）。
		this._gallery = await window.electronAPI.extensions.listGallery();
		this._fireChange();

		const port = await extHostPortPromise;
		port.start();

		const protocol: IMessagePassingProtocol = {
			send: (m) => port.postMessage(m),
			onMessage: (cb) => {
				port.onmessage = (ev): void => cb(ev.data);
			},
		};
		const rpc = new RPCProtocol(protocol);

		this._extHostExtensions = rpc.getProxy<ExtHostExtensionServiceShape>(ExtHostContext.ExtHostExtensionService);
		this._extHostCommands = rpc.getProxy<ExtHostCommandsShape>(ExtHostContext.ExtHostCommands);

		// 供扩展宿主回调的 MainThread 处理器
		rpc.set<MainThreadCommandsShape>(MainContext.MainThreadCommands, {
			$registerCommand: (id) => this._onRegisterCommand(id),
			$unregisterCommand: (id) => this._onUnregisterCommand(id),
			$executeCommand: (id, args) => this.commandService.executeCommand(id, ...args),
		});
		rpc.set<MainThreadMessageShape>(MainContext.MainThreadMessageService, {
			$showMessage: async (severity, message) => {
				this.notificationService.notify(severity as NotificationSeverity, message);
			},
		});
		rpc.set<MainThreadExtensionServiceShape>(MainContext.MainThreadExtensionService, {
			$onDidChangeActivation: (id, state) => {
				this._status.set(id, state);
				this._fireChange();
			},
		});

		// 扩展宿主连接完成后，再加载已安装扩展
		await this._extHostExtensions.$setDisabledExtensions([...this._disabled]);
		this._installed = await this._extHostExtensions.$getExtensions();
		this._reconcileCommands();
		// 启动即激活 * / onStartupFinished 扩展（懒激活扩展仍等各自命令触发）
		await this._extHostExtensions.$activateByEvent("onStartupFinished");

		console.log(`[renderer] extension host connected, ${this._installed.length} installed`);
		this._fireChange();
	}

	/**
	 * 扩展宿主注册了一条命令。贡献命令已由 manifest 预注册（带正确 title/category），
	 * 不要覆盖；这里只处理「运行时动态注册的非贡献命令」，让它也能被 workbench 调用。
	 */
	private _onRegisterCommand(id: string): void {
		if (this.commandService.getCommand(id)) return;
		if (this._dynamicCommandDisposables.has(id)) return;
		const d = this.commandService.registerCommand({
			id,
			title: id, // 无贡献元数据可用，退回显示原始 id
			handler: (...args: unknown[]) => this._extHostCommands.$executeContributedCommand(id, args),
		});
		this._dynamicCommandDisposables.set(id, d);
	}

	private _onUnregisterCommand(id: string): void {
		this._dynamicCommandDisposables.get(id)?.dispose();
		this._dynamicCommandDisposables.delete(id);
	}

	// ── 管理操作 ──────────────────────────────────────────────

	getViewModels(): ExtensionViewModel[] {
		return this._viewModels;
	}

	private _recomputeViewModels(): void {
		const installedById = new Map(this._installed.map((e) => [e.id, e]));
		// 合并 gallery id 与已安装 id（已安装扩展不一定仍在 gallery 中）
		const ids = new Set<string>([...this._gallery.map((g) => g.id), ...installedById.keys()]);

		this._viewModels = [...ids]
			.map((id) => {
				const g = this._gallery.find((x) => x.id === id);
				const inst = installedById.get(id);
				return {
					id,
					displayName: g?.displayName ?? inst?.displayName ?? id,
					description: g?.description ?? "",
					publisher: g?.publisher ?? "mini-vscode",
					version: g?.version ?? "0.0.0",
					installed: !!inst,
					enabled: !this._disabled.has(id),
					status: this._status.get(id) ?? "idle",
				};
			})
			.sort((a, b) => a.displayName.localeCompare(b.displayName));
	}

	private _fireChange(): void {
		this._recomputeViewModels();
		this._onDidChangeExtensions.fire();
	}

	async install(id: string): Promise<void> {
		this._setStatus(id, "installing");
		try {
			await window.electronAPI.extensions.install(id);
			await this._refreshInstalled();
			// 新装的 * / 启动扩展应立即激活（会经广播把 status 置为 active）
			await this._extHostExtensions.$activateByEvent("onStartupFinished");
		} finally {
			this._clearTransient(id, "installing");
		}
		this.notificationService.notify("info", `Installed extension '${id}'.`);
	}

	async uninstall(id: string): Promise<void> {
		this._setStatus(id, "uninstalling");
		try {
			this._disposeCommands(id);
			// 先停用（释放资源、清模块缓存），再删文件 → 重装从干净状态开始
			await this._extHostExtensions.$deactivate(id);
			await window.electronAPI.extensions.uninstall(id);
			await this._refreshInstalled();
		} finally {
			this._status.delete(id);
			this._fireChange();
		}
		this.notificationService.notify("info", `Uninstalled extension '${id}'.`);
	}

	async setEnabled(id: string, enabled: boolean): Promise<void> {
		if (enabled) this._disabled.delete(id);
		else this._disabled.add(id);
		this.storageService.store(DISABLED_KEY, [...this._disabled], StorageScope.GLOBAL);
		await this._extHostExtensions.$setDisabledExtensions([...this._disabled]);
		if (enabled) {
			// 重新激活 * / 启动扩展（懒激活扩展仍等命令触发）
			await this._extHostExtensions.$activateByEvent("onStartupFinished");
		} else {
			// 停用正在运行的实例（调 deactivate、释放 subscriptions、反注册命令）
			await this._extHostExtensions.$deactivate(id);
			this._status.delete(id);
		}
		this._reconcileCommands();
		this._fireChange();
	}

	private _setStatus(id: string, status: ExtensionStatus): void {
		this._status.set(id, status);
		this._fireChange();
	}

	/** 仅当当前状态仍是该瞬时值时清除，避免覆盖宿主广播来的 active/failed */
	private _clearTransient(id: string, transient: ExtensionStatus): void {
		if (this._status.get(id) === transient) {
			this._status.delete(id);
			this._fireChange();
		}
	}

	// ── 内部逻辑 ───────────────────────────────────────────────

	private async _refreshInstalled(): Promise<void> {
		this._installed = await this._extHostExtensions.$rescan();
		this._reconcileCommands();
		this._fireChange();
	}

	/** 为已安装且启用的扩展注册命令，并注销其他扩展的命令 */
	private _reconcileCommands(): void {
		const shouldHave = new Set(this._installed.filter((e) => !this._disabled.has(e.id)).map((e) => e.id));
		// 注销当前已禁用/已卸载扩展的命令
		for (const id of [...this._commandDisposables.keys()]) {
			if (!shouldHave.has(id)) this._disposeCommands(id);
		}
		// 注册新启用扩展的命令
		for (const ext of this._installed) {
			if (shouldHave.has(ext.id) && !this._commandDisposables.has(ext.id)) {
				this._registerCommands(ext);
			}
		}
	}

	private _registerCommands(ext: ExtensionDescription): void {
		const disposables: IDisposable[] = [];
		for (const cmd of ext.contributes.commands ?? []) {
			disposables.push(
				// 命令面板可以看到这个命令，但此时拓展还是没有被激活
				this.commandService.registerCommand({
					id: cmd.command,
					title: cmd.title,
					category: cmd.category ?? ext.displayName ?? ext.name,
					handler: async (...args: unknown[]) => {
						// 懒激活扩展，然后在扩展宿主中执行真正的处理器
						// 先手动激活扩展（可能是 onCommand:xxx 触发的懒激活），再对应的执行命令
						await this._extHostExtensions.$activateByEvent(`onCommand:${cmd.command}`);
						return this._extHostCommands.$executeContributedCommand(cmd.command, args);
					},
				})
			);
		}
		this._commandDisposables.set(ext.id, disposables);
	}

	private _disposeCommands(id: string): void {
		this._commandDisposables.get(id)?.forEach((d) => d.dispose());
		this._commandDisposables.delete(id);
	}
}

registerSingleton(IExtensionService, ExtensionService);
