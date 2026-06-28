import { createDecorator } from "../../instantiation/instantiation";
import { registerSingleton } from "../../instantiation/extensions";
import type { IDisposable } from "../../base/lifecycle";
import { monaco } from "../monaco-setup";
import { IEditorService } from "../editor/editorService";
import { RPCProtocol } from "../../../platform/rpc/rpcProtocol";
import {
	MainContext,
	ExtHostContext,
	type MainThreadLanguageFeaturesShape,
	type MainThreadDiagnosticsShape,
	type ExtHostLanguageFeaturesShape,
	type ExtHostDocumentsShape,
	type ExtHostExtensionServiceShape,
	type UriComponents,
	type IMarkerDto,
} from "../../../platform/rpc/proxyIdentifiers";

export interface ILanguageFeaturesService {
	readonly _serviceBrand: undefined;
	/** 在扩展宿主 RPC 通道建立后调用一次：接好语言特性桥 + 文档同步 */
	attach(rpc: RPCProtocol): void;
}

export const ILanguageFeaturesService = createDecorator<ILanguageFeaturesService>("languageFeaturesService");

/**
 * LanguageFeaturesService（renderer）—— Phase 13.2 的「主线程」侧。
 * 1) 文档同步：把 monaco 文本模型的打开/变更/关闭单向推给扩展宿主（ExtHostDocuments）。
 * 2) 语言特性桥：扩展宿主注册 definition provider 时，在 monaco 注册一个转发 provider，
 *    被触发时 RPC 到 ExtHostLanguageFeatures 求结果，并做 DTO↔monaco 坐标/Uri 转换。
 */
export class LanguageFeaturesService implements ILanguageFeaturesService {
	declare readonly _serviceBrand: undefined;

	private _extHostLang!: ExtHostLanguageFeaturesShape;
	private _extHostDocs!: ExtHostDocumentsShape;
	private _extHostExtensions!: ExtHostExtensionServiceShape;
	private readonly _providers = new Map<number, IDisposable>();
	/** 简化版 marker 存储：owner → (文件 path → 诊断)。用于「文件后打开时补设波浪线」（坑 #2） */
	private readonly _markers = new Map<string, Map<string, IMarkerDto[]>>();
	private _docsWired = false;
	private _openerWired = false;

	constructor(@IEditorService private readonly editorService: IEditorService) {}

	/**
	 * 每次建立 RPC 通道都要调用。注意：StrictMode/重连会让 start() 跑多次、
	 * 创建多个 RPCProtocol（后者的 port.onmessage 生效），因此 rpc.set 必须
	 * **每次都做**（落到当前生效的 rpc 上）；只有全局的 monaco 文档监听一次性接。
	 */
	attach(rpc: RPCProtocol): void {
		this._extHostLang = rpc.getProxy<ExtHostLanguageFeaturesShape>(ExtHostContext.ExtHostLanguageFeatures);
		this._extHostDocs = rpc.getProxy<ExtHostDocumentsShape>(ExtHostContext.ExtHostDocuments);
		this._extHostExtensions = rpc.getProxy<ExtHostExtensionServiceShape>(ExtHostContext.ExtHostExtensionService);

		rpc.set<MainThreadLanguageFeaturesShape>(MainContext.MainThreadLanguageFeatures, {
			$registerDefinitionProvider: (handle, selector) => this._registerDefinition(handle, selector),
			$unregisterProvider: (handle) => {
				this._providers.get(handle)?.dispose();
				this._providers.delete(handle);
			},
		});

		rpc.set<MainThreadDiagnosticsShape>(MainContext.MainThreadDiagnostics, {
			$changeMany: (owner, entries) => this._changeMany(owner, entries),
		});

		// monaco 文档监听是全局的，只接一次；回调里用 this._extHostDocs（已指向最新 rpc）。
		if (!this._docsWired) {
			this._docsWired = true;
			this._wireDocuments();
		}

		// 跨文件导航：标准版 monaco 默认不会跳到「另一个 model」，必须由宿主接管
		// 打开请求（go-to-definition / references 到别的文件都走这里）。只注册一次。
		if (!this._openerWired) {
			this._openerWired = true;
			monaco.editor.registerEditorOpener({
				openCodeEditor: (_source, resource, selectionOrPosition) => {
					let line = 1;
					let column = 1;
					if (selectionOrPosition) {
						if ("lineNumber" in selectionOrPosition) {
							line = selectionOrPosition.lineNumber;
							column = selectionOrPosition.column;
						} else {
							line = selectionOrPosition.startLineNumber;
							column = selectionOrPosition.startColumn;
						}
					}
					// 打开目标文件并定位（复用 13.1 的 revealPosition，行列为 monaco 1-based）
					void this.editorService.revealPosition(resource.path, line, column);
					return true;
				},
			});
		}
	}

	private _uri(model: { uri: { scheme: string; path: string } }): UriComponents {
		return { scheme: model.uri.scheme, path: model.uri.path };
	}

	/** monaco 文本模型生命周期 → 推送到扩展宿主（v1 推全文，不做增量） */
	private _wireDocuments(): void {
		const track = (model: monaco.editor.ITextModel): void => {
			this._extHostDocs.$acceptModelOpened(this._uri(model), model.getValue(), model.getLanguageId());
			// 绑定monaco editor的变化，任何代码的编辑，都会实时同步到插件的textDocument
			model.onDidChangeContent(() => this._extHostDocs.$acceptModelChanged(this._uri(model), model.getValue()));
			// 触发 onLanguage: 激活事件（让按语言激活的扩展——如 LSP 客户端——在打开对应文件时启动）
			this._extHostExtensions.$activateByEvent(`onLanguage:${model.getLanguageId()}`);
			// 坑 #2：文件此刻才打开，把之前缓存的诊断补设为波浪线
			this._applyCachedMarkers(model);
		};
		monaco.editor.getModels().forEach(track);
		monaco.editor.onDidCreateModel(track);
		monaco.editor.onWillDisposeModel((model) => this._extHostDocs.$acceptModelClosed(this._uri(model)));
	}

	private _registerDefinition(handle: number, selector: string[]): void {
		const disposable = monaco.languages.registerDefinitionProvider(selector, {
			provideDefinition: async (model, position) => {
				const dtos = await this._extHostLang.$provideDefinition(handle, this._uri(model), {
					line: position.lineNumber - 1, // monaco 1-based → vscode 0-based
					character: position.column - 1,
				});
				return dtos.map((dto) => ({
					uri: monaco.Uri.from({ scheme: dto.uri.scheme || "file", path: dto.uri.path }),
					range: {
						startLineNumber: dto.range.start.line + 1, // vscode 0-based → monaco 1-based
						startColumn: dto.range.start.character + 1,
						endLineNumber: dto.range.end.line + 1,
						endColumn: dto.range.end.character + 1,
					},
				}));
			},
		});
		this._providers.set(handle, disposable);
	}

	// ── 诊断（Phase 13.3）──────────────────────────────────────

	/** 扩展宿主按 owner 批量更新诊断 → 缓存 + 设到对应 model 的 marker */
	private _changeMany(owner: string, entries: [UriComponents, IMarkerDto[]][]): void {
		let perOwner = this._markers.get(owner);
		if (!perOwner) {
			perOwner = new Map<string, IMarkerDto[]>();
			this._markers.set(owner, perOwner);
		}
		for (const [uri, dtos] of entries) {
			if (dtos.length === 0) perOwner.delete(uri.path);
			else perOwner.set(uri.path, dtos);
			// 坑 #1：按 path 找 model（model 的 uri.scheme 可能是空串，不能重建 uri 去匹配）
			const model = monaco.editor.getModels().find((m) => m.uri.path === uri.path);
			if (model) monaco.editor.setModelMarkers(model, owner, dtos.map(toMonacoMarker));
		}
	}

	/** 某 model 刚创建时，把缓存里属于它的各 owner 诊断补设为 marker */
	private _applyCachedMarkers(model: monaco.editor.ITextModel): void {
		for (const [owner, perOwner] of this._markers) {
			const dtos = perOwner.get(model.uri.path);
			if (dtos && dtos.length) monaco.editor.setModelMarkers(model, owner, dtos.map(toMonacoMarker));
		}
	}
}

/** vscode severity(0..3) → monaco MarkerSeverity（Error=8/Warning=4/Info=2/Hint=1，坑 #3） */
const MONACO_SEVERITY = [8, 4, 2, 1];

function toMonacoMarker(dto: IMarkerDto): monaco.editor.IMarkerData {
	return {
		severity: MONACO_SEVERITY[dto.severity] ?? 8,
		message: dto.message,
		startLineNumber: dto.range.start.line + 1, // vscode 0-based → monaco 1-based
		startColumn: dto.range.start.character + 1,
		endLineNumber: dto.range.end.line + 1,
		endColumn: dto.range.end.character + 1,
		source: dto.source,
		code: dto.code,
	};
}

registerSingleton(ILanguageFeaturesService, LanguageFeaturesService);
