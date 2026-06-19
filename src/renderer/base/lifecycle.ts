/**
 * Lifecycle primitives — a trimmed-down version of VSCode's
 * `vs/base/common/lifecycle.ts`.
 *
 * Anything that holds resources (event listeners, timers, child objects)
 * implements IDisposable so it can be torn down deterministically.
 */

export interface IDisposable {
  dispose(): void
}

/** Wrap a teardown function as an IDisposable */
export function toDisposable(fn: () => void): IDisposable {
  return { dispose: fn }
}

/** Dispose one disposable, or every disposable in an iterable */
export function dispose<T extends IDisposable>(disposable: T): T
export function dispose<T extends IDisposable>(disposables: T[]): T[]
export function dispose(arg: IDisposable | IDisposable[]): IDisposable | IDisposable[] {
  if (Array.isArray(arg)) {
    arg.forEach(d => d.dispose())
    return arg
  }
  arg.dispose()
  return arg
}

/**
 * A bag of disposables that are all torn down together.
 * Add child disposables with `.add()`; calling `.dispose()` releases them all.
 */
export class DisposableStore implements IDisposable {
  private readonly _toDispose = new Set<IDisposable>()
  private _isDisposed = false

  get isDisposed(): boolean {
    return this._isDisposed
  }

  add<T extends IDisposable>(disposable: T): T {
    if (this._isDisposed) {
      // Already disposed — dispose the newcomer immediately to avoid leaks
      disposable.dispose()
      return disposable
    }
    this._toDispose.add(disposable)
    return disposable
  }

  /** Dispose all current children but keep the store usable */
  clear(): void {
    this._toDispose.forEach(d => d.dispose())
    this._toDispose.clear()
  }

  dispose(): void {
    if (this._isDisposed) return
    this._isDisposed = true
    this.clear()
  }
}

/**
 * Base class for objects that own disposables.
 * Subclasses call `this._register(...)` to tie a child's lifetime to their own.
 */
export abstract class Disposable implements IDisposable {
  protected readonly _store = new DisposableStore()

  protected _register<T extends IDisposable>(disposable: T): T {
    return this._store.add(disposable)
  }

  dispose(): void {
    this._store.dispose()
  }
}
