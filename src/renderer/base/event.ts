import { IDisposable, toDisposable } from './lifecycle'

/**
 * Event/Emitter — a trimmed-down version of VSCode's `vs/base/common/event.ts`.
 *
 * An `Event<T>` is NOT an object — it's a *function* you call with a listener.
 * Calling it registers the listener and returns an IDisposable to unsubscribe:
 *
 *   const d = service.onDidChange(value => { ... })
 *   d.dispose() // stop listening
 *
 * Producers own an `Emitter<T>`, fire it with `.fire(value)`, and expose the
 * read-only `.event` to consumers. This is the backbone of VSCode's reactivity.
 */
export type Event<T> = (listener: (e: T) => void) => IDisposable

export class Emitter<T> {
  private _listeners = new Set<(e: T) => void>()
  private _event?: Event<T>

  /** The public Event consumers subscribe to */
  get event(): Event<T> {
    if (!this._event) {
      this._event = (listener: (e: T) => void): IDisposable => {
        this._listeners.add(listener)
        return toDisposable(() => {
          this._listeners.delete(listener)
        })
      }
    }
    return this._event
  }

  /** Notify all current listeners */
  fire(event: T): void {
    // Snapshot so a listener that unsubscribes mid-dispatch doesn't break iteration
    for (const listener of [...this._listeners]) {
      listener(event)
    }
  }

  hasListeners(): boolean {
    return this._listeners.size > 0
  }

  dispose(): void {
    this._listeners.clear()
  }
}
