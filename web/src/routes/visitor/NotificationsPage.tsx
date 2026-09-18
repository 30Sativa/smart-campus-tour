import { useState } from 'react'
import { Link } from 'react-router'
import { BellOff, CheckCheck } from 'lucide-react'
import { PageHeader } from '../../features/visitor/components/PageHeader'
import { EmptyState, ErrorState, LoadingSkeleton } from '../../features/visitor/components/States'
import { NOTIFICATION_KIND } from '../../features/visitor/visitor-content'
import { useMarkNotificationsRead, useNotifications } from '../../features/visitor/visitor-hooks'
import { formatDateLong, formatRelative, formatTime } from '../../features/visitor/visitor-format'

/**
 * What the campus has told this visitor.
 *
 * One list, newest first, unread marked twice over — a filled dot beside the
 * title and an accent mark on the icon — so the state never rests on colour
 * alone. A row that is about something opens it; a row that is only news does
 * not pretend to be a link.
 */
export default function NotificationsPage() {
  const notifications = useNotifications()
  const markRead = useMarkNotificationsRead()
  const [unreadOnly, setUnreadOnly] = useState(false)
  const visible = [...(notifications.data ?? [])].filter((item) => !unreadOnly || !item.readAt).sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  const unread = notifications.data?.filter((item) => !item.readAt).length ?? 0

  return (
    <div className="vs-page vs-stack">
      <PageHeader
        eyebrow="Notifications"
        title="Notifications"
        description={
          unread > 0
            ? `${unread} ${unread === 1 ? 'message' : 'messages'} you have not read yet.`
            : 'Tour updates, booking confirmations and campus news.'
        }
        actions={
          unread > 0 ? (
            <button
              type="button"
              className="lp-btn lp-btn--ghost lp-btn--sm"
              onClick={() => markRead.mutate()}
              disabled={markRead.isPending}
              aria-busy={markRead.isPending}
            >
              <CheckCheck size={15} strokeWidth={2} aria-hidden="true" />
              {markRead.isPending ? 'Marking as read…' : 'Mark all as read'}
            </button>
          ) : undefined
        }
      />
      <div className="vs-pills" role="group" aria-label="Notification filter"><button className="vs-pill" type="button" aria-pressed={!unreadOnly} onClick={() => setUnreadOnly(false)}>All updates</button><button className="vs-pill" type="button" aria-pressed={unreadOnly} onClick={() => setUnreadOnly(true)}>Unread · {unread}</button></div>
      {markRead.isSuccess && <p className="vs-feedback" role="status">All caught up. Your notifications are marked as read.</p>}

      {notifications.isPending ? (
        <LoadingSkeleton rows={3} columns={1} />
      ) : notifications.isError ? (
        <ErrorState error={notifications.error} onRetry={() => void notifications.refetch()} />
      ) : visible.length === 0 ? (
        <EmptyState
          title={unreadOnly ? 'You are all caught up' : 'Nothing to read'}
          text={unreadOnly ? 'There are no unread updates. Your earlier messages are still in All updates.' : 'When a booking is confirmed or a robot is on its way, you will hear about it here.'}
          icon={<BellOff size={22} strokeWidth={1.9} aria-hidden="true" />}
        />
      ) : (
        <div className="vs-card">
          {visible.map((item) => {
            const { label, icon: Icon } = NOTIFICATION_KIND[item.kind]
            const stamp = `${formatDateLong(item.createdAt)}, ${formatTime(item.createdAt)}`
            return (
              <article key={item.id} className="vs-note" data-unread={item.readAt ? 'false' : 'true'}>
                <span className="vs-note__mark" aria-hidden="true">
                  <Icon size={17} strokeWidth={1.9} />
                </span>
                <div className="vs-min">
                  <p className="vs-note__title">
                    {item.title}
                    {!item.readAt && <span className="vs-sr">Unread</span>}
                  </p>
                  <p className="vs-note__text">{item.body}</p>
                  <p className="vs-note__time" title={stamp}>
                    {label} · {formatRelative(item.createdAt)}
                  </p>
                  {item.href && (
                    <div className="vs-card__foot" style={{ paddingTop: 12 }}>
                      <Link to={item.href} className="lp-btn lp-btn--ghost lp-btn--sm">
                        Open
                      </Link>
                    </div>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      )}

      {markRead.isError && (
        <div className="auth-alert" role="alert">
          We could not mark those as read. Check your connection and try again.
        </div>
      )}
    </div>
  )
}
