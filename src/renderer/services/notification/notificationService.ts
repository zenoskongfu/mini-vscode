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
 * Minimal NotificationService (toast queue). Phase 9 will expand it; for now it
 * backs `vscode.window.showInformationMessage` from the extension host.
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
    // auto-dismiss after 5s
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
