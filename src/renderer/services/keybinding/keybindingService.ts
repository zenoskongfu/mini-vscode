import { createDecorator } from '../../instantiation/instantiation'
import { registerSingleton } from '../../instantiation/extensions'
import { Disposable, toDisposable, IDisposable } from '../../base/lifecycle'
import { ICommandService } from '../commands/commandService'

export interface IKeybindingService {
  readonly _serviceBrand: undefined

  /** Bind a normalized chord (e.g. "mod+shift+p") to a command id */
  registerKeybinding(chord: string, commandId: string): IDisposable
  /** Human-readable label for a command's keybinding, if any (for the palette) */
  lookupKeybinding(commandId: string): string | undefined
}

export const IKeybindingService = createDecorator<IKeybindingService>('keybindingService')

const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().includes('MAC')

/**
 * Convert a KeyboardEvent into a canonical chord string.
 * The primary modifier (Ctrl on Win/Linux, Cmd on macOS) is normalized to "mod"
 * so a single binding works cross-platform — VSCode's CommandOrControl concept.
 */
function eventToChord(e: KeyboardEvent): string {
  const key = e.key.toLowerCase()
  if (key === 'control' || key === 'meta' || key === 'alt' || key === 'shift') {
    return '' // modifier-only press
  }
  const parts: string[] = []
  if (e.ctrlKey || e.metaKey) parts.push('mod')
  if (e.altKey) parts.push('alt')
  if (e.shiftKey) parts.push('shift')
  parts.push(key)
  return parts.join('+')
}

/** Render a chord as a platform-appropriate label, e.g. "⌘⇧P" / "Ctrl+Shift+P" */
function chordToLabel(chord: string): string {
  return chord
    .split('+')
    .map(part => {
      switch (part) {
        case 'mod': return isMac ? '⌘' : 'Ctrl'
        case 'shift': return isMac ? '⇧' : 'Shift'
        case 'alt': return isMac ? '⌥' : 'Alt'
        case '`': return '`'
        default: return part.length === 1 ? part.toUpperCase() : part
      }
    })
    .join(isMac ? '' : '+')
}

/**
 * KeybindingService — installs a single document keydown listener, normalizes
 * each event to a chord, and dispatches the bound command via ICommandService.
 * Mirrors VSCode's KeybindingService + KeybindingsRegistry.
 */
export class KeybindingService extends Disposable implements IKeybindingService {
  declare readonly _serviceBrand: undefined

  private readonly _chordToCommand = new Map<string, string>()
  private readonly _commandToChord = new Map<string, string>()

  constructor(@ICommandService private readonly commandService: ICommandService) {
    super()
    const handler = (e: KeyboardEvent): void => this._onKeyDown(e)
    document.addEventListener('keydown', handler, true)
    this._register(toDisposable(() => document.removeEventListener('keydown', handler, true)))
  }

  registerKeybinding(chord: string, commandId: string): IDisposable {
    this._chordToCommand.set(chord, commandId)
    this._commandToChord.set(commandId, chord)
    return toDisposable(() => {
      this._chordToCommand.delete(chord)
      this._commandToChord.delete(commandId)
    })
  }

  lookupKeybinding(commandId: string): string | undefined {
    const chord = this._commandToChord.get(commandId)
    return chord ? chordToLabel(chord) : undefined
  }

  private _onKeyDown(e: KeyboardEvent): void {
    const chord = eventToChord(e)
    if (!chord) return
    const commandId = this._chordToCommand.get(chord)
    if (!commandId) return
    // A binding matched — take over from the browser/editor and run it.
    e.preventDefault()
    e.stopPropagation()
    this.commandService.executeCommand(commandId)
  }
}

registerSingleton(IKeybindingService, KeybindingService)
