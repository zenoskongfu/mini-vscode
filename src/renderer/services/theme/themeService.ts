import { createDecorator } from "../../instantiation/instantiation";
import { registerSingleton } from "../../instantiation/extensions";
import { Emitter, Event } from "../../base/event";
import { toDisposable, type IDisposable } from "../../base/lifecycle";
import { IConfigurationService } from "../configuration/configurationService";
import type { ColorThemeData } from "../../themes/theme-types";
import { darkPlus } from "../../themes/dark-plus";
import { lightPlus } from "../../themes/light-plus";
import { loadColorThemeFromJson } from "../../themes/color-theme-json-loader";
import { resolveThemeCustomizations } from "../../themes/theme-customizations";
import learningJsonTheme from "../../themes/learning-json-theme.json";
import { defineMonacoTheme, monaco, monacoThemeName } from "../monaco-setup";
import { IStorageService, StorageScope } from "../storage/storageService";

const THEME_SETTING = "workbench.colorTheme";
const WORKBENCH_COLOR_CUSTOMIZATIONS_SETTING = "workbench.colorCustomizations";
const EDITOR_TOKEN_COLOR_CUSTOMIZATIONS_SETTING = "editor.tokenColorCustomizations";
const DEFAULT_COLOR_THEME_ID = darkPlus.id;
const COLOR_THEME_SNAPSHOT_KEY = "theme.currentColorThemeSnapshot";
const COLOR_THEME_SNAPSHOT_VERSION = 1;

const BUILTIN_COLOR_THEMES: ColorThemeData[] = [
	{ ...darkPlus, source: "builtin" },
	{ ...lightPlus, source: "builtin" },
	loadColorThemeFromJson({
		id: "Learning JSON Dark",
		source: "builtin",
		baseTheme: darkPlus,
		json: learningJsonTheme,
	}),
];

export type ThemeApplyTarget = "auto" | "preview";

interface StoredColorThemeSnapshot {
	version: typeof COLOR_THEME_SNAPSHOT_VERSION;
	theme: ColorThemeData;
}

export interface IThemeService {
	readonly _serviceBrand: undefined;

	readonly onDidChangeTheme: Event<ColorThemeData>;
	readonly current: ColorThemeData;

	/** 当前已注册的颜色主题（内置 + 后续插件贡献），供主题选择器使用 */
	getColorThemes(): ColorThemeData[];
	/** 注册颜色主题；释放返回值会撤销注册，并在必要时回退到默认主题 */
	registerColorTheme(theme: ColorThemeData): IDisposable;
	/** 按 id 应用主题；preview 只临时应用，不更新下次启动使用的主题快照 */
	applyTheme(id: string, target?: ThemeApplyTarget): void;
	/** 从配置加载主题并订阅配置变化；启动时调用一次 */
	initialize(): void;
	/** 静态扩展主题注册完成后进行最终校正；启动编排调用一次 */
	completeStartup(): void;
	getMonacoBase(): "vs-dark" | "vs";
	/** 当前主题对应的 Monaco 自定义主题名（供 <Editor theme=…> 用） */
	getMonacoThemeName(): string;
}

export const IThemeService = createDecorator<IThemeService>("themeService");

/**
 * ThemeService 把主题的 CSS 自定义属性注入到 :root，
 * 并保持 Monaco 编辑器主题同步。它对应 VSCode 的 IThemeService：
 * 当前主题由 `workbench.colorTheme` 配置值驱动。
 */
export class ThemeService implements IThemeService {
	declare readonly _serviceBrand: undefined;

	private readonly _colorThemes = new Map<string, ColorThemeData>();
	private _current: ColorThemeData = BUILTIN_COLOR_THEMES[0];
	private _initialized = false;
	private _startupComplete = false;
	private _restoredSnapshotId: string | undefined;

	private readonly _onDidChangeTheme = new Emitter<ColorThemeData>();
	readonly onDidChangeTheme = this._onDidChangeTheme.event;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IStorageService private readonly storageService: IStorageService
	) {
		for (const theme of BUILTIN_COLOR_THEMES) {
			this.registerColorTheme(theme);
		}

		// VSCode 的 WorkbenchThemeService 也是 eager 恢复上次已解析主题：
		// 这里必须在 React Workbench 首次绘制前同步完成，避免先显示固定 Dark+。
		const snapshot = this.readSnapshot();
		const initialTheme = snapshot ?? this.getFallbackTheme();
		this._restoredSnapshotId = snapshot?.id;
		this.applyResolvedTheme(initialTheme, { storeSnapshot: false, fireEvent: false });
	}

	get current(): ColorThemeData {
		return this._current;
	}

	getColorThemes(): ColorThemeData[] {
		return [...this._colorThemes.values()].sort((a, b) => a.label.localeCompare(b.label));
	}

	getMonacoBase(): "vs-dark" | "vs" {
		return this._current.monacoBase;
	}

	getMonacoThemeName(): string {
		return monacoThemeName(this._current.id);
	}

	initialize(): void {
		this.applyFromConfig();
		if (this._initialized) return;
		this._initialized = true;
		// settings.json 修改主题后重新应用
		this.configurationService.onDidChangeConfiguration(() => this.applyFromConfig());
	}

	completeStartup(): void {
		if (this._startupComplete) return;
		this._startupComplete = true;
		// 插件主题此时已经完成首轮注册。若快照来自已卸载插件，
		// 这里才最终回退；若插件仍存在，则用真实文件数据覆盖快照。
		this.applyFromConfig();
	}

	private applyFromConfig(): void {
		const id = this.configurationService.getValue<string>(THEME_SETTING, DEFAULT_COLOR_THEME_ID);

		// 配置可能先于扩展主题注册完成。若首帧快照正好就是配置选择的
		// 插件主题，先保留快照，避免短暂回退 Dark+；启动完成后再最终校正。
		if (
			!this._startupComplete &&
			!this._colorThemes.has(id) &&
			this._restoredSnapshotId === id &&
			this._current.id === id
		) {
			return;
		}
		this.applyTheme(id);
	}

	applyTheme(id: string, target: ThemeApplyTarget = "auto"): void {
		const baseTheme = this._colorThemes.get(id) ?? this.getFallbackTheme();
		const theme = this.createCustomizedTheme(baseTheme);
		this.applyResolvedTheme(theme, {
			storeSnapshot: target !== "preview",
			fireEvent: true,
		});
	}

	private applyResolvedTheme(
		theme: ColorThemeData,
		options: { storeSnapshot: boolean; fireEvent: boolean }
	): void {
		this._current = theme;

		// 1. CSS 自定义属性 → :root
		const root = document.documentElement;
		for (const [name, value] of Object.entries(theme.colors)) {
			root.style.setProperty(name, value);
		}
		// 原生表单控件/滚动条跟随主题类型
		root.style.colorScheme = theme.type;
		root.setAttribute("data-theme", theme.type);

		// 2. Monaco 编辑器主题：用户 token 覆盖会改变同名主题规则，因此这里强制重新 define。
		defineMonacoTheme(theme, true);
		monaco.editor.setTheme(monacoThemeName(theme.id));

		if (options.storeSnapshot) {
			this.storeSnapshot(theme);
		}
		if (options.fireEvent) {
			this._onDidChangeTheme.fire(theme);
		}
	}

	registerColorTheme(theme: ColorThemeData): IDisposable {
		if (this._colorThemes.has(theme.id)) {
			console.warn(`[ThemeService] color theme id "${theme.id}" is already registered; ignoring duplicate.`);
			return toDisposable(() => undefined);
		}

		this._colorThemes.set(theme.id, theme);
		defineMonacoTheme(theme);

		// 插件主题可能在配置和 ThemeService 初始化之后才被发现。
		// 如果 settings.json 正好选择了它，注册完成后立即应用。
		if (
			this._initialized &&
			this.configurationService.getValue<string>(THEME_SETTING, DEFAULT_COLOR_THEME_ID) === theme.id
		) {
			this.applyTheme(theme.id);
		}

		return toDisposable(() => {
			// id 后续若被另一个注册替换，不误删新主题。
			if (this._colorThemes.get(theme.id) !== theme) return;
			this._colorThemes.delete(theme.id);
			if (this._current.id === theme.id) {
				this.applyTheme(DEFAULT_COLOR_THEME_ID);
			}
		});
	}

	private getFallbackTheme(): ColorThemeData {
		return this._colorThemes.get(DEFAULT_COLOR_THEME_ID) ?? BUILTIN_COLOR_THEMES[0];
	}

	private readSnapshot(): ColorThemeData | undefined {
		const stored = this.storageService.getObject<unknown>(
			COLOR_THEME_SNAPSHOT_KEY,
			StorageScope.GLOBAL,
			undefined
		);
		if (!isStoredColorThemeSnapshot(stored)) {
			return undefined;
		}
		return cloneSnapshotTheme(stored.theme);
	}

	private storeSnapshot(theme: ColorThemeData): void {
		const snapshot: StoredColorThemeSnapshot = {
			version: COLOR_THEME_SNAPSHOT_VERSION,
			theme: cloneSnapshotTheme(theme),
		};
		try {
			this.storageService.store(COLOR_THEME_SNAPSHOT_KEY, snapshot, StorageScope.GLOBAL);
		} catch (error) {
			// localStorage 不可写不应阻断本次主题应用。
			console.warn("[ThemeService] failed to store color theme startup snapshot:", error);
		}
	}

	private createCustomizedTheme(baseTheme: ColorThemeData): ColorThemeData {
		const customizations = resolveThemeCustomizations(
			this.configurationService.getValue<unknown>(WORKBENCH_COLOR_CUSTOMIZATIONS_SETTING, undefined),
			this.configurationService.getValue<unknown>(EDITOR_TOKEN_COLOR_CUSTOMIZATIONS_SETTING, undefined),
			baseTheme.id
		);

		return {
			...baseTheme,
			colors: {
				...baseTheme.colors,
				...customizations.colors,
			},
			tokenRules: [...(baseTheme.tokenRules ?? []), ...customizations.tokenRules],
		};
	}
}

function isStoredColorThemeSnapshot(value: unknown): value is StoredColorThemeSnapshot {
	if (!isRecord(value) || value.version !== COLOR_THEME_SNAPSHOT_VERSION || !isRecord(value.theme)) {
		return false;
	}

	const theme = value.theme;
	if (
		typeof theme.id !== "string" ||
		typeof theme.label !== "string" ||
		(theme.type !== "dark" && theme.type !== "light") ||
		(theme.monacoBase !== "vs-dark" && theme.monacoBase !== "vs") ||
		(theme.semanticHighlighting !== undefined && typeof theme.semanticHighlighting !== "boolean") ||
		(theme.source !== undefined && theme.source !== "builtin" && theme.source !== "extension") ||
		(theme.extensionId !== undefined && typeof theme.extensionId !== "string") ||
		!isStringRecord(theme.colors)
	) {
		return false;
	}

	if (
		theme.tokenRules !== undefined &&
		(!Array.isArray(theme.tokenRules) ||
			!theme.tokenRules.every(
				(rule) =>
					isRecord(rule) &&
					typeof rule.token === "string" &&
					(rule.foreground === undefined || typeof rule.foreground === "string") &&
					(rule.fontStyle === undefined || typeof rule.fontStyle === "string")
			))
	) {
		return false;
	}

	return true;
}

function cloneSnapshotTheme(theme: ColorThemeData): ColorThemeData {
	return {
		id: theme.id,
		label: theme.label,
		type: theme.type,
		monacoBase: theme.monacoBase,
		colors: { ...theme.colors },
		tokenRules: theme.tokenRules?.map((rule) => ({ ...rule })),
		semanticHighlighting: theme.semanticHighlighting,
		source: theme.source,
		extensionId: theme.extensionId,
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringRecord(value: unknown): value is Record<string, string> {
	return isRecord(value) && Object.values(value).every((entry) => typeof entry === "string");
}

registerSingleton(IThemeService, ThemeService);
