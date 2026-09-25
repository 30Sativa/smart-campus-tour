import { Link } from 'react-router'
import type { RepresentativeRegistration } from '../../api/contracts/representative'
import { Loading, Pill, RegistrationChip, TourChip } from '../../features/representative/components/RepUi'
import { useRepRegistrations } from '../../features/representative/representative-hooks'
import { dayMonth, formatTime, readRepError } from '../../features/representative/rep-format'

function nextStep(r: RepresentativeRegistration): string {
  if (r.tourState === 'Completed') return 'Buổi đã hoàn thành.'
  if (r.tourState === 'Cancelled') return 'Buổi đã bị hủy.'
  switch (r.state) {
    case 'Submitted':
      return r.resubmittedAfterApproval ? 'Đã thay danh sách, chờ Admin duyệt lại.' : 'Chờ Admin duyệt danh sách.'
    case 'Rejected':
      return r.allowedActions.edit.allowed ? 'Xem lý do, sửa rồi gửi lại.' : 'Đã bị từ chối.'
    case 'Approved':
      return r.participation ? 'Đã có đường dẫn và mã đoàn để chia sẻ.' : 'Đã duyệt.'
    default:
      return r.allowedActions.reRegister.allowed ? 'Có thể đăng ký lại.' : 'Đã hủy.'
  }
}

/** My Registrations (flow review §4.1): one row per Tour, the state and what to do next. */
export default function RepRegistrationsPage() {
  const list = useRepRegistrations()

  return (
    <div className="rp-ctn">
      <section className="rp-section">
        <div className="rp-sec-head">
          <h2>Đăng ký của tôi</h2>
          <span className="rp-mono">{list.data ? `(${String(list.data.length).padStart(2, '0')})` : ''}</span>
        </div>
        {list.isLoading && <Loading />}
        {list.isError && (
          <div className="rp-callout rp-callout--danger" role="alert" style={{ marginTop: 16 }}>
            <div><b>Không tải được đăng ký</b><p>{readRepError(list.error).message}</p></div>
          </div>
        )}
        {list.data && list.data.length === 0 && (
          <div className="rp-empty">
            <h3>Bạn chưa đăng ký buổi nào</h3>
            <p>Chọn một buổi đang nhận đăng ký, điền thông tin đoàn và tải danh sách học sinh.</p>
            <Pill to="/dai-dien">Xem buổi tham quan</Pill>
          </div>
        )}
        {list.data && list.data.length > 0 && (
          <ol className="rp-rows">
            {list.data.map((r) => {
              const d = dayMonth(r.tourScheduledAt)
              return (
                <li key={r.id} className="rp-row">
                  <div className="rp-date"><b>{d.day}</b><span>{d.month} · {formatTime(r.tourScheduledAt)}</span></div>
                  <div style={{ minWidth: 0 }}>
                    <h3><Link to={`/dai-dien/dang-ky/${r.id}`}>{r.tourName}</Link></h3>
                    <div className="rp-row__meta">
                      <RegistrationChip state={r.state} />
                      <TourChip state={r.tourState} />
                      <span>{r.schoolName}</span>
                      <span>{r.studentCount} học sinh</span>
                    </div>
                    <p className="rp-muted" style={{ fontSize: 13, marginTop: 6 }}>{nextStep(r)}</p>
                  </div>
                  <div className="rp-row__side">
                    <Pill to={`/dai-dien/dang-ky/${r.id}`} light={r.state !== 'Rejected'}>{r.state === 'Rejected' && r.allowedActions.edit.allowed ? 'Xem lý do' : 'Mở'}</Pill>
                  </div>
                </li>
              )
            })}
          </ol>
        )}
      </section>
    </div>
  )
}
