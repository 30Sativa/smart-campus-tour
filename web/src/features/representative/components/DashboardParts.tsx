import { Link } from 'react-router'
import type { RegistrationSummary } from '../api/types'
import { repButton } from '../rep-classes'
import { formatDateTime, groupLabel } from '../rep-format'
import { Callout, ErrorState, RegistrationStatusBadge, RepPageHeader } from './RepUi'

export function RepOverviewHeader() {
  return <RepPageHeader title="Tổng quan" description="Theo dõi đăng ký và chuẩn bị lời mời cho buổi tham quan."
    action={<Link to="/dai-dien/buoi" className={repButton('primary')}>Xem buổi tham quan</Link>} />
}

/** Keep the next registered visit and incomplete-query states visible on the overview. */
export function RepHero({ next, loading = false, error, onRetry }: {
  next: RegistrationSummary | null; loading?: boolean; error?: string; onRetry?: () => void
}) {
  return <section className="rep-section rep-card rep-next-card" aria-labelledby="rep-next-title">
    <div className="rep-section-head"><h2 id="rep-next-title">Buổi sắp tới gần nhất</h2></div>
    {loading ? <p role="status" aria-busy="true" className="rep-hint">Đang kiểm tra lịch tham quan của bạn…</p>
      : error ? <ErrorState title="Chưa xác định được buổi sắp tới" message={error} onRetry={onRetry} />
      : next ? <div className="rep-list-row">
        <div className="rep-stack rep-next-summary">
          <h3>{next.tourName}</h3>
          <p className="rep-reg-meta"><span className="num">{formatDateTime(next.tourScheduledStartAt)}</span><span>{groupLabel(next) ?? next.schoolName}</span></p>
          <RegistrationStatusBadge state={next.state} />
        </div>
        <Link to={`/dai-dien/dang-ky/${next.id}`} className={repButton('secondary', 'sm')}>Xem đăng ký sắp tới</Link>
      </div>
        : <p className="rep-hint">Chưa có đăng ký chờ duyệt hoặc đã duyệt cho một buổi tham quan sắp tới.</p>}
  </section>
}

export function RepAttention({ registration }: { registration: RegistrationSummary }) {
  return <Callout tone="warn" title={`${groupLabel(registration) ?? registration.schoolName} cần bạn xử lý`} role="status"
    actions={<Link to={`/dai-dien/dang-ky/${registration.id}`} className={repButton('secondary', 'sm')}>Xem lý do và sửa</Link>}>
    <p>{registration.rejectionReason?.trim() || `Đại học FPT đã từ chối đăng ký cho ${registration.tourName}. Mở hồ sơ để xem lý do và các thao tác hiện còn cho phép.`}</p>
  </Callout>
}

/** Kept for existing consumers; useful navigation replaces the promotional band. */
export function RepClosing() {
  return <nav className="rep-inline-actions" aria-label="Tiếp tục quản lý tham quan">
    <Link to="/dai-dien/buoi" className={repButton('secondary')}>Buổi tham quan</Link>
    <Link to="/dai-dien/dang-ky" className={repButton('secondary')}>Đăng ký của tôi</Link>
  </nav>
}
