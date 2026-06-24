import { createDecorator } from "../../instantiation/instantiation";
import { registerSingleton } from "../../instantiation/extensions";
import { Disposable, toDisposable, IDisposable } from "../../base/lifecycle";
import { ICommandService } from "../commands/commandService";

export interface IKeybindingService {
	readonly _serviceBrand: undefined;

	/** 将标准化后的按键和弦（如 "mod+shift+p"）绑定到命令 id */
	registerKeybinding(chord: string, commandId: string): IDisposable;
	/** 命令快捷键的人类可读标签（若存在，供命令面板显示） */
	lookupKeybinding(commandId: string): string | undefined;
}

export const IKeybindingService = createDecorator<IKeybindingService>("keybindingService");

const isMac = typeof navigator !== "undefined" && navigator.platform.toUpperCase().includes("MAC");

/**
 * 将 KeyboardEvent 转换为标准按键和弦字符串。
 * 主修饰键（Win/Linux 上的 Ctrl，macOS 上的 Cmd）会标准化为 "mod"，
 * 让一份绑定跨平台生效，对应 VSCode 的 CommandOrControl 概念。
 */
function eventToChord(e: KeyboardEvent): string {
	const key = e.key.toLowerCase();
	if (key === "control" || key === "meta" || key === "alt" || key === "shift") {
		return ""; // 只有修饰键的按下事件
	}
	const parts: string[] = [];
	if (e.ctrlKey || e.metaKey) parts.push("mod");
	if (e.altKey) parts.push("alt");
	if (e.shiftKey) parts.push("shift");
	parts.push(key);
	return parts.join("+");
}

/** 将按键和弦渲染为符合平台习惯的标签，如 "⌘⇧P" / "Ctrl+Shift+P" */
function chordToLabel(chord: string): string {
	return chord
		.split("+")
		.map((part) => {
			switch (part) {
				case "mod":
					return isMac ? "⌘" : "Ctrl";
				case "shift":
					return isMac ? "⇧" : "Shift";
				case "alt":
					return isMac ? "⌥" : "Alt";
				case "`":
					return "`";
				default:
					return part.length === 1 ? part.toUpperCase() : part;
			}
		})
		.join(isMac ? "" : "+");
}

/**
 * KeybindingService 安装一个全局 document keydown listener，
 * 把每个事件标准化为按键和弦，再通过 ICommandService 分发绑定命令。
 * 对应 VSCode 的 KeybindingService + KeybindingsRegistry。
 */
export class KeybindingService extends Disposable implements IKeybindingService {
	declare readonly _serviceBrand: undefined;

	private readonly _chordToCommand = new Map<string, string>();
	private readonly _commandToChord = new Map<string, string>();

	constructor(@ICommandService private readonly commandService: ICommandService) {
		super();
		const handler = (e: KeyboardEvent): void => this._onKeyDown(e);
		// 捕获
		document.addEventListener("keydown", handler, true);
		this._register(toDisposable(() => document.removeEventListener("keydown", handler, true)));
	}

	registerKeybinding(chord: string, commandId: string): IDisposable {
		this._chordToCommand.set(chord, commandId);
		this._commandToChord.set(commandId, chord);
		return toDisposable(() => {
			this._chordToCommand.delete(chord);
			this._commandToChord.delete(commandId);
		});
	}

	lookupKeybinding(commandId: string): string | undefined {
		const chord = this._commandToChord.get(commandId);
		return chord ? chordToLabel(chord) : undefined;
	}

	private _onKeyDown(e: KeyboardEvent): void {
		const chord = eventToChord(e);
		if (!chord) return;
		const commandId = this._chordToCommand.get(chord);
		if (!commandId) return;
		// 匹配到绑定后，接管浏览器/编辑器默认行为并执行命令。
		// 阻止自然行为
		e.preventDefault();
		// 阻止冒泡
		e.stopPropagation();
		this.commandService.executeCommand(commandId);
	}
}

registerSingleton(IKeybindingService, KeybindingService);
