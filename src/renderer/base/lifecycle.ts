/**
 * 生命周期基础设施：VSCode `vs/base/common/lifecycle.ts` 的精简版。
 *
 * 任何持有资源的对象（事件监听器、定时器、子对象）都实现 IDisposable，
 * 这样就能被确定性地释放。
 */

export interface IDisposable {
  dispose(): void
}

/** 将清理函数包装成 IDisposable */
export function toDisposable(fn: () => void): IDisposable {
  return { dispose: fn }
}

/** dispose 单个 disposable，或一个可迭代集合中的所有 disposable */
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
 * 一组会被一起释放的 disposables。
 * 通过 `.add()` 加入子 disposable；调用 `.dispose()` 会释放全部子项。
 */
export class DisposableStore implements IDisposable {
  private readonly _toDispose = new Set<IDisposable>()
  private _isDisposed = false

  get isDisposed(): boolean {
    return this._isDisposed
  }

  add<T extends IDisposable>(disposable: T): T {
    if (this._isDisposed) {
      // store 已被 dispose；立即 dispose 新加入项以避免泄漏
      disposable.dispose()
      return disposable
    }
    this._toDispose.add(disposable)
    return disposable
  }

  /** dispose 当前所有子项，但保留 store 可继续使用 */
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
 * 持有 disposable 的对象基类。
 * 子类调用 `this._register(...)`，把子资源生命周期绑定到自身。
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
