import { createDecorator } from '../../instantiation/instantiation'
import { registerSingleton } from '../../instantiation/extensions'
import { Emitter, Event } from '../../base/event'

export interface IQuickInputService {
  readonly _serviceBrand: undefined

  readonly onDidChangeVisibility: Event<boolean>
  readonly isVisible: boolean

  show(): void
  hide(): void
  toggle(): void
}

export const IQuickInputService = createDecorator<IQuickInputService>('quickInputService')

/**
 * QuickInputService — owns the Command Palette overlay's visibility
 * (VSCode IQuickInputService analog, simplified to commands-only).
 */
export class QuickInputService implements IQuickInputService {
  declare readonly _serviceBrand: undefined

  private _visible = false

  private readonly _onDidChangeVisibility = new Emitter<boolean>()
  readonly onDidChangeVisibility = this._onDidChangeVisibility.event

  get isVisible(): boolean {
    return this._visible
  }

  show(): void {
    if (this._visible) return
    this._visible = true
    this._onDidChangeVisibility.fire(true)
  }

  hide(): void {
    if (!this._visible) return
    this._visible = false
    this._onDidChangeVisibility.fire(false)
  }

  toggle(): void {
    this._visible ? this.hide() : this.show()
  }
}

registerSingleton(IQuickInputService, QuickInputService)
