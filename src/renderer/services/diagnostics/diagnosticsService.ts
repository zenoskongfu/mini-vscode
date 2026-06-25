import { createDecorator } from '../../instantiation/instantiation'
import { registerSingleton } from '../../instantiation/extensions'
import { Emitter, Event } from '../../base/event'
import { monaco } from '../monaco-setup'

export type DiagnosticSeverity = 'error' | 'warning' | 'info' | 'hint'

/** 一条诊断（由 Monaco model marker 归一而来） */
export interface IDiagnosticItem {
  path: string
  fileName: string
  line: number
  column: number
  message: string
  severity: DiagnosticSeverity
  source?: string
}

export interface IDiagnosticCounts {
  errors: number
  warnings: number
  total: number
}

export interface IDiagnosticsService {
  readonly _serviceBrand: undefined
  /** 任意 model 的 marker 变化时触发 */
  readonly onDidChangeDiagnostics: Event<void>
  /** 全部诊断，按严重度→文件→行排序（引用稳定，直到下次变化） */
  getProblems(): IDiagnosticItem[]
  /** 错误/警告/总数（引用稳定，直到下次变化） */
  getCounts(): IDiagnosticCounts
}

export const IDiagnosticsService = createDecorator<IDiagnosticsService>('diagnosticsService')

/**
 * DiagnosticsService —— Phase 13.1。监听 Monaco 的 `onDidChangeMarkers`，把
 * 所有 model 的 marker（含内置 TS/JS worker、以及未来扩展/LSP 设置的 marker，
 * 它们用不同 owner，故能共存）汇总成 Problems 视图的数据源。
 *
 * 缓存 `_problems` / `_counts`，使 getter 在两次变化之间返回同一引用
 * （满足 useEvent / useSyncExternalStore 的引用稳定性要求）。
 */
export class DiagnosticsService implements IDiagnosticsService {
  declare readonly _serviceBrand: undefined

  private readonly _onDidChange = new Emitter<void>()
  readonly onDidChangeDiagnostics = this._onDidChange.event

  private _problems: IDiagnosticItem[] = []
  private _counts: IDiagnosticCounts = { errors: 0, warnings: 0, total: 0 }

  constructor() {
    monaco.editor.onDidChangeMarkers(() => this._recompute())
    this._recompute()
  }

  getProblems(): IDiagnosticItem[] {
    return this._problems
  }

  getCounts(): IDiagnosticCounts {
    return this._counts
  }

  private _recompute(): void {
    const markers = monaco.editor.getModelMarkers({})
    this._problems = markers
      .map(m => ({
        path: m.resource.path,
        fileName: m.resource.path.split('/').pop() ?? m.resource.path,
        line: m.startLineNumber,
        column: m.startColumn,
        message: m.message,
        severity: toSeverity(m.severity),
        source: m.source
      }))
      .sort(
        (a, b) =>
          rank(b.severity) - rank(a.severity) ||
          a.path.localeCompare(b.path) ||
          a.line - b.line ||
          a.column - b.column
      )

    let errors = 0
    let warnings = 0
    for (const p of this._problems) {
      if (p.severity === 'error') errors++
      else if (p.severity === 'warning') warnings++
    }
    this._counts = { errors, warnings, total: this._problems.length }

    this._onDidChange.fire()
  }
}

function toSeverity(s: number): DiagnosticSeverity {
  // monaco.MarkerSeverity: Error=8, Warning=4, Info=2, Hint=1
  switch (s) {
    case monaco.MarkerSeverity.Error:
      return 'error'
    case monaco.MarkerSeverity.Warning:
      return 'warning'
    case monaco.MarkerSeverity.Info:
      return 'info'
    default:
      return 'hint'
  }
}

function rank(s: DiagnosticSeverity): number {
  return s === 'error' ? 3 : s === 'warning' ? 2 : s === 'info' ? 1 : 0
}

registerSingleton(IDiagnosticsService, DiagnosticsService)
