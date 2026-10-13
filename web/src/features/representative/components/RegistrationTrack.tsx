import type { RegistrationState, TourState } from '../api/types'

/**
 * Where a registration is on its way, drawn as a route with four stops:
 * sent → Admin review → approved → tour day. A refusal stops the route at the
 * review stop in red; a cancellation shows only the first stop.
 */
export function RegistrationTrack({ state, tourState }: { state: RegistrationState; tourState: TourState }) {
  const finished = state === 'APPROVED' && tourState === 'COMPLETED'
  const reached = state === 'CANCELLED' ? 0 : state === 'SUBMITTED' || state === 'REJECTED' ? 1 : finished ? 3 : 2
  const labels = ['Đã gửi', state === 'REJECTED' ? 'Bị từ chối' : state === 'CANCELLED' ? 'Đã hủy' : 'Admin duyệt', 'Đã duyệt', finished ? 'Đã tham quan' : 'Ngày tham quan']
  const offset = 100 - (reached / 3) * 100
  return (
    <div className={`rep-track${state === 'REJECTED' || state === 'CANCELLED' ? ' is-bad' : ''}`} style={{ '--rep-track-off': offset } as React.CSSProperties} aria-hidden="true">
      <svg className="rep-track-line" viewBox="0 0 100 6" preserveAspectRatio="none" focusable="false">
        <line className="rep-track-bg" x1="0" y1="3" x2="100" y2="3" />
        <line className="rep-track-fg" x1="0" y1="3" x2="100" y2="3" pathLength={100} />
      </svg>
      {labels.map((label, index) => (
        <span key={index} className={index < reached || (finished && index === 3) ? 'is-done' : index === reached ? 'is-now' : ''} style={{ '--k': index } as React.CSSProperties}>{label}</span>
      ))}
    </div>
  )
}
