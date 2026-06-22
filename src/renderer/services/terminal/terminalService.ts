import { createDecorator } from '../../instantiation/instantiation'
import { registerSingleton } from '../../instantiation/extensions'
import { Emitter, Event } from '../../base/event'

export interface ITerminalInstance {
  id: string
  title: string
}

export interface ITerminalService {
  readonly _serviceBrand: undefined

  /** Fires when terminals are added/removed or the active one changes */
  readonly onDidChangeTerminals: Event<void>

  readonly terminals: readonly ITerminalInstance[]
  readonly activeId: string | null

  createTerminal(cwd?: string): ITerminalInstance
  setActive(id: string): void
  closeTerminal(id: string): void

  write(id: string, data: string): void
  resize(id: string, cols: number, rows: number): void

  /** Subscribe to a specific terminal's output stream; returns an unsubscribe fn */
  onTerminalData(id: string, cb: (data: string) => void): () => void
}

export const ITerminalService = createDecorator<ITerminalService>('terminalService')

let seq = 0

/**
 * TerminalService (renderer) — manages terminal instance metadata and bridges
 * the xterm views to the main-process pty over IPC.
 *
 * It owns ONE `terminal:data` / `terminal:exit` subscription and fans output
 * out to per-id callbacks (the xterm view registers its writer here).
 */
export class TerminalService implements ITerminalService {
  declare readonly _serviceBrand: undefined

  private _terminals: ITerminalInstance[] = []
  private _activeId: string | null = null

  /** id → output sink (the mounted xterm's write) */
  private _dataSinks = new Map<string, (data: string) => void>()

  private readonly _onDidChangeTerminals = new Emitter<void>()
  readonly onDidChangeTerminals = this._onDidChangeTerminals.event

  constructor() {
    // Single IPC subscription, fanned out by id
    window.electronAPI.terminal.onData((id, data) => {
      this._dataSinks.get(id)?.(data)
    })
    window.electronAPI.terminal.onExit(id => {
      this.closeTerminal(id)
    })
  }

  get terminals(): readonly ITerminalInstance[] {
    return this._terminals
  }

  get activeId(): string | null {
    return this._activeId
  }

  createTerminal(cwd?: string): ITerminalInstance {
    const n = ++seq
    const id = `term-${n}`
    // Title carries a stable ordinal so labels don't renumber when a terminal is killed
    const instance: ITerminalInstance = { id, title: `bash ${n}` }
    this._terminals = [...this._terminals, instance]
    this._activeId = id
    window.electronAPI.terminal.create(id, cwd ?? '')
    this._onDidChangeTerminals.fire()
    return instance
  }

  setActive(id: string): void {
    if (this._activeId === id) return
    this._activeId = id
    this._onDidChangeTerminals.fire()
  }

  closeTerminal(id: string): void {
    if (!this._terminals.some(t => t.id === id)) return
    const idx = this._terminals.findIndex(t => t.id === id)
    this._terminals = this._terminals.filter(t => t.id !== id)
    this._dataSinks.delete(id)
    window.electronAPI.terminal.kill(id)

    if (this._activeId === id) {
      const neighbour = this._terminals[idx] ?? this._terminals[idx - 1] ?? null
      this._activeId = neighbour ? neighbour.id : null
    }
    this._onDidChangeTerminals.fire()
  }

  write(id: string, data: string): void {
    window.electronAPI.terminal.input(id, data)
  }

  resize(id: string, cols: number, rows: number): void {
    window.electronAPI.terminal.resize(id, cols, rows)
  }

  onTerminalData(id: string, cb: (data: string) => void): () => void {
    this._dataSinks.set(id, cb)
    return () => {
      if (this._dataSinks.get(id) === cb) this._dataSinks.delete(id)
    }
  }
}

registerSingleton(ITerminalService, TerminalService)
