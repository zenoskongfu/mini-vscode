import { createDecorator } from "../../instantiation/instantiation";
import { registerSingleton } from "../../instantiation/extensions";
import { Emitter, Event } from "../../base/event";
import { IWorkspaceService } from "../workspace/workspaceService";

/** 一个已打开的编辑器标签页 */
export interface EditorTab {
	path: string;
	name: string;
	/** 从磁盘加载到的内容（“已保存”的基线） */
	savedContent: string;
	/** 编辑器里的当前实时内容（切换标签页时保留未保存修改） */
	content: string;
	/** 当 content 与 savedContent 不同时为 true */
	dirty: boolean;
}

export interface IEditorService {
	readonly _serviceBrand: undefined;

	/** 标签页列表变化（打开/关闭）或 dirty 状态翻转时触发 */
	readonly onDidChangeTabs: Event<void>;
	/** 当前活动编辑器变化时触发 */
	readonly onDidChangeActiveEditor: Event<string | null>;

	readonly tabs: readonly EditorTab[];
	readonly activePath: string | null;
	readonly activeTab: EditorTab | null;

	openEditor(path: string): Promise<void>;
	activate(path: string): void;
	close(path: string): void;
	closeOthers(path: string): void;
	closeToRight(path: string): void;
	closeAll(): void;
	/** 文件被重命名/移动后同步对应 tab 的 path/name */
	rename(oldPath: string, newPath: string): void;
	updateContent(path: string, content: string): void;
	save(path: string): Promise<void>;

	/** 视图请求把光标滚动定位到某行列时触发 */
	readonly onDidRequestReveal: Event<{ path: string; line: number; column: number }>;
	/** 打开文件并请求定位到指定行列（Problems / 搜索结果跳转用） */
	revealPosition(path: string, line: number, column: number): Promise<void>;
	/** 视图挂载时取走待处理的定位请求（处理「文件刚打开、视图还没订阅」的时序） */
	consumeReveal(path: string): { line: number; column: number } | null;
}

export const IEditorService = createDecorator<IEditorService>("editorService");

/**
 * EditorService 持有已打开标签页列表与当前活动编辑器，
 * 对应 VSCode 的 IEditorService。
 * 状态位于 class 内部；视图通过 onDidChangeTabs / onDidChangeActiveEditor 订阅。
 */
export class EditorService implements IEditorService {
	declare readonly _serviceBrand: undefined;

	private _tabs: EditorTab[] = [];
	private _activePath: string | null = null;

	private readonly _onDidChangeTabs = new Emitter<void>();
	readonly onDidChangeTabs = this._onDidChangeTabs.event;

	private readonly _onDidChangeActiveEditor = new Emitter<string | null>();
	readonly onDidChangeActiveEditor = this._onDidChangeActiveEditor.event;

	private readonly _onDidRequestReveal = new Emitter<{ path: string; line: number; column: number }>();
	readonly onDidRequestReveal = this._onDidRequestReveal.event;
	/** path → 待消费的定位请求（视图挂载晚于请求时兜底） */
	private readonly _pendingReveals = new Map<string, { line: number; column: number }>();

	constructor(@IWorkspaceService private readonly workspaceService: IWorkspaceService) {
		// 切换/关闭工作区时关掉所有编辑器 tab（VSCode 行为）
		this.workspaceService.onDidChangeRoot(() => this.closeAll());
	}

	get tabs(): readonly EditorTab[] {
		return this._tabs;
	}

	get activePath(): string | null {
		return this._activePath;
	}

	get activeTab(): EditorTab | null {
		return this._tabs.find((t) => t.path === this._activePath) ?? null;
	}

	private _setActive(path: string | null): void {
		if (this._activePath === path) return;
		this._activePath = path;
		this._onDidChangeActiveEditor.fire(path);
	}

	async openEditor(path: string): Promise<void> {
		const existing = this._tabs.find((t) => t.path === path);
		if (existing) {
			this._setActive(path);
			return;
		}

		let content = "";
		try {
			content = await window.electronAPI.fs.readFile(path);
		} catch {
			content = "";
		}

		const tab: EditorTab = {
			path,
			name: path.split("/").pop() ?? path,
			savedContent: content,
			content,
			dirty: false,
		};
		this._tabs = [...this._tabs, tab];
		this._onDidChangeTabs.fire();
		this._setActive(path);
	}

	activate(path: string): void {
		this._setActive(path);
	}

	close(path: string): void {
		const idx = this._tabs.findIndex((t) => t.path === path);
		if (idx === -1) return;

		this._tabs = this._tabs.filter((t) => t.path !== path);
		this._onDidChangeTabs.fire();

		if (this._activePath === path) {
			const neighbour = this._tabs[idx] ?? this._tabs[idx - 1] ?? null;
			this._setActive(neighbour ? neighbour.path : null);
		}
	}

	updateContent(path: string, currentContent: string): void {
		const tab = this._tabs.find((t) => t.path === path);
		if (!tab || tab.content === currentContent) return;
		const wasDirty = tab.dirty;
		tab.content = currentContent;
		tab.dirty = currentContent !== tab.savedContent;
		if (tab.dirty !== wasDirty) {
			// 换新数组引用：updateContent 原地改了 tab.dirty，若数组引用不变，
			// useEvent(onDidChangeTabs, ()=>tabs) 检测不到变化 → dirty 圆点不刷新。
			this._tabs = [...this._tabs];
			this._onDidChangeTabs.fire();
		}
	}

	closeOthers(path: string): void {
		const keep = this._tabs.find((t) => t.path === path);
		if (!keep || this._tabs.length === 1) return;
		this._tabs = [keep];
		this._onDidChangeTabs.fire();
		if (this._activePath !== path) this._setActive(path);
	}

	closeToRight(path: string): void {
		const idx = this._tabs.findIndex((t) => t.path === path);
		if (idx === -1 || idx === this._tabs.length - 1) return;
		this._tabs = this._tabs.slice(0, idx + 1);
		this._onDidChangeTabs.fire();
		if (this._activePath && !this._tabs.some((t) => t.path === this._activePath)) this._setActive(path);
	}

	closeAll(): void {
		if (this._tabs.length === 0) return;
		this._tabs = [];
		this._onDidChangeTabs.fire();
		this._setActive(null);
	}

	rename(oldPath: string, newPath: string): void {
		const tab = this._tabs.find((t) => t.path === oldPath);
		if (!tab) return;
		tab.path = newPath;
		tab.name = newPath.split("/").pop() ?? newPath;
		this._tabs = [...this._tabs];
		this._onDidChangeTabs.fire();
		if (this._activePath === oldPath) {
			this._activePath = newPath;
			this._onDidChangeActiveEditor.fire(newPath);
		}
	}

	async save(path: string): Promise<void> {
		const tab = this._tabs.find((t) => t.path === path);
		if (!tab) return;
		await window.electronAPI.fs.writeFile(path, tab.content);
		tab.savedContent = tab.content;
		tab.dirty = false;
		// 换新数组引用：原地清了 tab.dirty，否则 useEvent 检测不到 → 圆点不消失（同 #7）
		this._tabs = [...this._tabs];
		this._onDidChangeTabs.fire();
	}

	async revealPosition(path: string, line: number, column: number): Promise<void> {
		await this.openEditor(path);
		// 记下待处理定位：若对应视图此刻还没订阅事件，挂载时会来 consume
		this._pendingReveals.set(path, { line, column });
		this._onDidRequestReveal.fire({ path, line, column });
	}

	consumeReveal(path: string): { line: number; column: number } | null {
		const r = this._pendingReveals.get(path) ?? null;
		if (r) this._pendingReveals.delete(path);
		return r;
	}
}

registerSingleton(IEditorService, EditorService);
