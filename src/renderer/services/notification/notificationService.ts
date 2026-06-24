import { createDecorator } from '../../instantiation/instantiation'
import { registerSingleton } from '../../instantiation/extensions'
import { Emitter, Event } from '../../base/event'

export type NotificationSeverity = 'info' | 'warning' | 'error'

export interface INotification {
  id: number
  severity: NotificationSeverity
  message: string
}

export interface INotificationService {
  readonly _serviceBrand: undefined
  readonly onDidChangeNotifications: Event<void>
  readonly notifications: readonly INotification[]
  notify(severity: NotificationSeverity, message: string): void
  dismiss(id: number): void
}

export const INotificationService = createDecorator<INotificationService>('notificationService')

let seq = 0

/**
 * 最小 NotificationService（toast 队列）。Phase 9 会继续扩展它；
 * 当前它支撑扩展宿主中的 `vscode.window.showInformationMessage`。
 */
export class NotificationService implements INotificationService {
  declare readonly _serviceBrand: undefined

  private _notifications: INotification[] = []
  private readonly _onDidChange = new Emitter<void>()
  readonly onDidChangeNotifications = this._onDidChange.event

  get notifications(): readonly INotification[] {
    return this._notifications
  }

  notify(severity: NotificationSeverity, message: string): void {
    const n: INotification = { id: ++seq, severity, message }
    this._notifications = [...this._notifications, n]
    this._onDidChange.fire()
    // 5 秒后自动关闭
    setTimeout(() => this.dismiss(n.id), 5000)
  }

  dismiss(id: number): void {
    const next = this._notifications.filter(n => n.id !== id)
    if (next.length === this._notifications.length) return
    this._notifications = next
    this._onDidChange.fire()
  }
}

registerSingleton(INotificationService, NotificationService)
