import { createDecorator } from "../../instantiation/instantiation";
import { registerSingleton } from "../../instantiation/extensions";
import { Emitter, Event } from "../../base/event";

type Settings = Record<string, unknown>;

export interface IConfigurationService {
	readonly _serviceBrand: undefined;

	/** Fires whenever any configuration value changes (settings.json saved) */
	readonly onDidChangeConfiguration: Event<void>;

	/** Load settings from the main process — call once at startup */
	initialize(): Promise<void>;

	getValue<T>(key: string, fallback: T): T;
	updateValue(key: string, value: unknown): Promise<void>;
	/** Absolute path of the backing settings.json (for "Open Settings") */
	getSettingsPath(): Promise<string>;
}

export const IConfigurationService = createDecorator<IConfigurationService>("configurationService");

/**
 * ConfigurationService (renderer) — VSCode IConfigurationService analog.
 * Caches the settings object loaded from the main-process settings.json and
 * notifies subscribers when it changes on disk.
 */
export class ConfigurationService implements IConfigurationService {
	declare readonly _serviceBrand: undefined;

	private _settings: Settings = {};

	private readonly _onDidChangeConfiguration = new Emitter<void>();
	readonly onDidChangeConfiguration = this._onDidChangeConfiguration.event;

	constructor() {
		// React to external edits (settings.json saved in the editor)
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
		// Optimistic local update; main writes the file → onChange confirms
		this._settings = { ...this._settings, [key]: value };
		this._onDidChangeConfiguration.fire();
		await window.electronAPI.config.set({ [key]: value });
	}

	getSettingsPath(): Promise<string> {
		return window.electronAPI.config.getPath();
	}
}

registerSingleton(IConfigurationService, ConfigurationService);
