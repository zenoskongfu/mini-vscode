import React from 'react'
import { useService } from '../../platform/ServicesContext'
import { useEvent } from '../../platform/useEvent'
import { INotificationService } from '../../services/notification/notificationService'
import './NotificationToast.css'

/**
 * Bottom-right toast stack. Subscribes to INotificationService and renders the
 * active notifications (auto-dismissed by the service).
 */
export function NotificationToasts(): React.JSX.Element | null {
  const notificationService = useService(INotificationService)
  const notifications = useEvent(
    notificationService.onDidChangeNotifications,
    () => notificationService.notifications
  )

  if (notifications.length === 0) return null

  return (
    <div className="notification-toasts">
      {notifications.map(n => (
        <div key={n.id} className={`notification-toast notification-toast--${n.severity}`}>
          <span className="notification-toast__message">{n.message}</span>
          <button
            className="notification-toast__close"
            onClick={() => notificationService.dismiss(n.id)}
            title="Dismiss"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
              <path d="M3 3l6 6M9 3l-6 6" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  )
}
