import { createDecorator } from "../../instantiation/instantiation";
import { registerSingleton } from "../../instantiation/extensions";
import { Emitter, Event } from "../../base/event";

type Settings = Record<string, unknown>;

export interface IConfigurationService {
	readonly _serviceBrand: undefined;

	/** 任意配置值变化（settings.json 保存）时触发 */
	readonly onDidChangeConfiguration: Event<void>;

	/** 从 main 进程加载设置；启动时调用一次 */
	initialize(): Promise<void>;

	getValue<T>(key: string, fallback: T): T;
	updateValue(key: string, value: unknown): Promise<void>;
	/** 底层 settings.json 的绝对路径（供“Open Settings”使用） */
	getSettingsPath(): Promise<string>;
}

export const IConfigurationService = createDecorator<IConfigurationService>("configurationService");

/**
 * ConfigurationService（renderer）：对应 VSCode 的 IConfigurationService。
 * 缓存从 main 进程 settings.json 加载的设置对象，
 * 并在磁盘内容变化时通知订阅者。
 */
export class ConfigurationService implements IConfigurationService {
	declare readonly _serviceBrand: undefined;

	private _settings: Settings = {};

	private readonly _onDidChangeConfiguration = new Emitter<void>();
	readonly onDidChangeConfiguration = this._onDidChangeConfiguration.event;

	constructor() {
		// 响应外部编辑（例如在编辑器中保存 settings.json）
		window.electronAPI.config.onChange((settings) => {
			this._settings = settings;
			// 告诉页面UI，预计订阅了该事件的themeService
			this._onDidChangeConfiguration.fire();
		});
	}

	async initialize(): Promise<void> {
		this._settings = await window.electronAPI.config.get();
		this._onDidChangeConfiguration.fire();
	}

	getValue<T>(key: string, fallback: T): T {
		const v = this._settings[key];
		return v === undefined ? fallback : (v as T);
	}

	async updateValue(key: string, value: unknown): Promise<void> {
		// 乐观本地更新；main 写入文件后由 onChange 确认
		this._settings = { ...this._settings, [key]: value };
		this._onDidChangeConfiguration.fire();
		await window.electronAPI.config.set({ [key]: value });
	}

	getSettingsPath(): Promise<string> {
		return window.electronAPI.config.getPath();
	}
}

registerSingleton(IConfigurationService, ConfigurationService);
