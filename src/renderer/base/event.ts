import { IDisposable, toDisposable } from './lifecycle'

/**
 * Event/Emitter：VSCode `vs/base/common/event.ts` 的精简版。
 *
 * `Event<T>` 不是对象，而是一个接收 listener 的函数。
 * 调用它会注册 listener，并返回一个 IDisposable 用于取消订阅：
 *
 *   const d = service.onDidChange(value => { ... })
 *   d.dispose() // 停止监听
 *
 * 生产者持有 `Emitter<T>`，通过 `.fire(value)` 触发事件，
 * 并只把只读的 `.event` 暴露给消费者。这是 VSCode 响应式机制的骨架。
 */
export type Event<T> = (listener: (e: T) => void) => IDisposable

export class Emitter<T> {
  private _listeners = new Set<(e: T) => void>()
  private _event?: Event<T>

  /** 供消费者订阅的公开 Event */
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

  /** 通知当前所有监听器 */
  fire(event: T): void {
    // 先复制快照，避免 listener 在分发过程中取消订阅导致迭代出错
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
