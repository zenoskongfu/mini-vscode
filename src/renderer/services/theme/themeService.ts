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

const THEME_SETTING = "workbench.colorTheme";
const WORKBENCH_COLOR_CUSTOMIZATIONS_SETTING = "workbench.colorCustomizations";
const EDITOR_TOKEN_COLOR_CUSTOMIZATIONS_SETTING = "editor.tokenColorCustomizations";
const DEFAULT_COLOR_THEME_ID = darkPlus.id;

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

export interface IThemeService {
	readonly _serviceBrand: undefined;

	readonly onDidChangeTheme: Event<ColorThemeData>;
	readonly current: ColorThemeData;

	/** 当前已注册的颜色主题（内置 + 后续插件贡献），供主题选择器使用 */
	getColorThemes(): ColorThemeData[];
	/** 注册颜色主题；释放返回值会撤销注册，并在必要时回退到默认主题 */
	registerColorTheme(theme: ColorThemeData): IDisposable;
	/** 按 id 应用主题（如 "Dark+"）；本方法不持久化，由调用方更新配置 */
	applyTheme(id: string): void;
	/** 从配置加载主题并订阅配置变化；启动时调用一次 */
	initialize(): void;
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

	private readonly _onDidChangeTheme = new Emitter<ColorThemeData>();
	readonly onDidChangeTheme = this._onDidChangeTheme.event;

	constructor(@IConfigurationService private readonly configurationService: IConfigurationService) {
		for (const theme of BUILTIN_COLOR_THEMES) {
			this.registerColorTheme(theme);
		}
		this._current = this.getFallbackTheme();
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

	private applyFromConfig(): void {
		const id = this.configurationService.getValue<string>(THEME_SETTING, DEFAULT_COLOR_THEME_ID);
		this.applyTheme(id);
	}

	applyTheme(id: string): void {
		const baseTheme = this._colorThemes.get(id) ?? this.getFallbackTheme();
		const theme = this.createCustomizedTheme(baseTheme);
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

		this._onDidChangeTheme.fire(theme);
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

registerSingleton(IThemeService, ThemeService);
