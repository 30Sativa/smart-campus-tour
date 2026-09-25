import { useCallback, useState } from 'react'
import { AlertTriangle, ArrowLeft, Check, Clock, Copy, Download, Info, Lock, Mail } from 'lucide-react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import type { RepresentativeRegistrationDetail } from '../../api/contracts/representative'
import { ConfirmDialog, Loading, Pill, RegistrationChip, Toast, TourChip } from '../../features/representative/components/RepUi'
import { useCopy } from '../../features/representative/use-copy'
import { RosterTable } from '../../features/representative/components/RosterImporter'
import { useCancelRegistration, useRepRegistration } from '../../features/representative/representative-hooks'
import { formatDateTime, readRepError, studentMessage } from '../../features/representative/rep-format'
import type { RepError } from '../../features/representative/rep-format'
import { downloadBytes, rosterWorkbookBytes } from '../../features/representative/roster-import'

/** My Registration (flow review §4.1): state, reason, invitation, roster, history and the valid actions. */
export default function RepRegistrationDetailPage() {
  const { registrationId = '' } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const query = useRepRegistration(registrationId)
  const cancel = useCancelRegistration()
  const [flash, setFlash] = useState<string | null>((location.state as { flash?: string } | null)?.flash ?? null)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [error, setError] = useState<RepError | null>(null)
  const clearFlash = useCallback(() => {
    setFlash(null)
    navigate('.', { replace: true, state: null })
  }, [navigate])

  if (query.isLoading) return <div className="rp-ctn"><Loading /></div>
  if (query.isError || !query.data) {
    return (
      <div className="rp-ctn rp-section">
        <div className="rp-callout rp-callout--danger" role="alert">
          <div>
            <b>Không mở được đăng ký</b>
            <p>{readRepError(query.error).message}</p>
            <div className="rp-callout__actions"><Link to="/dai-dien/dang-ky" className="rp-chip-btn">Về đăng ký của tôi</Link></div>
          </div>
        </div>
      </div>
    )
  }

  const r = query.data
  const a = r.allowedActions
  const locked = r.tourState !== 'Scheduled'
  const lockReason = a.cancel.reason && locked ? a.cancel.reason : null

  const doCancel = () => {
    setError(null)
    cancel.mutate(
      { id: r.id, version: r.version },
      {
        onSuccess: () => {
          setConfirmCancel(false)
          setFlash('Đã hủy đăng ký. Học sinh không còn vào được bằng mã đoàn này.')
        },
        onError: (e) => {
          setConfirmCancel(false)
          setError(readRepError(e))
        },
      },
    )
  }

  return (
    <div className="rp-ctn">
      <section className="rp-band">
        <img src="/images/hero-campus.jpg" alt="" aria-hidden="true" />
        <div className="rp-band__top">
          <Link to="/dai-dien/dang-ky" className="rp-back"><ArrowLeft size={14} />Đăng ký của tôi</Link>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <RegistrationChip state={r.state} />
            <TourChip state={r.tourState} />
          </div>
        </div>
        <div>
          <span className="rp-kicker">{r.tourCode} · {r.schoolName}</span>
          <h1 style={{ marginTop: 12 }}>{r.tourName}</h1>
        </div>
        <div className="rp-band__meta">
          <div><b>{formatDateTime(r.tourScheduledAt)}</b>Giờ dự kiến</div>
          <div><b>{r.studentCount}</b>Học sinh trong danh sách</div>
          <div><b>{formatDateTime(r.submittedAt)}</b>Gửi lần gần nhất</div>
        </div>
      </section>

      <div className="rp-layout">
        <div className="rp-stack">
          {error && (
            <div className="rp-callout rp-callout--warn" role="alert">
              <AlertTriangle size={18} />
              <div><b>Không thực hiện được</b><p>{error.message} Trang đã tải lại trạng thái mới nhất.</p></div>
            </div>
          )}

          <StatusCallout r={r} />

          {r.participation && <Participation r={r} />}

          {lockReason && (
            <div className="rp-callout">
              <Lock size={18} />
              <div><b>Đăng ký đã khóa</b><p>{lockReason}</p></div>
            </div>
          )}

          <div className="rp-card">
            <div className="rp-card-title">
              <span>Danh sách học sinh · {r.studentCount}</span>
              <button type="button" className="rp-link" onClick={() => downloadBytes(`CampusTour-${r.tourCode}-danh-sach.xlsx`, rosterWorkbookBytes(r.roster))}>
                <Download size={13} />Tải về .xlsx
              </button>
            </div>
            <RosterTable rows={r.roster} searchable={r.roster.length > 12} />
            <p className="rp-muted" style={{ fontSize: 12, marginTop: 10 }}>
              {r.withClassCount} / {r.studentCount} dòng có lớp. Học sinh nhập đúng họ tên (không phân biệt dấu, hoa thường) và lớp nếu dòng có lớp.
            </p>
          </div>
        </div>

        <aside className="rp-stack">
          <div className="rp-card">
            <div className="rp-card-title">Thao tác</div>
            <div className="rp-stack" style={{ gap: 10 }}>
              {a.edit.allowed && (
                <Pill to={`/dai-dien/dang-ky/${r.id}/sua`} block>{r.state === 'Rejected' ? 'Sửa và gửi lại' : 'Sửa đăng ký'}</Pill>
              )}
              {a.replaceRoster.allowed && <Pill to={`/dai-dien/dang-ky/${r.id}/sua`} block>Thay danh sách học sinh</Pill>}
              {a.reRegister.allowed && <Pill to={`/dai-dien/buoi/${r.tourId}/dang-ky`} block>Đăng ký lại</Pill>}
              {a.cancel.allowed && (
                <button type="button" className="rp-chip-btn rp-chip-btn--danger" onClick={() => setConfirmCancel(true)}>Hủy đăng ký</button>
              )}
              {!a.edit.allowed && !a.replaceRoster.allowed && !a.reRegister.allowed && !a.cancel.allowed && (
                <p className="rp-muted" style={{ fontSize: 14 }}>{lockReason ?? 'Không có thao tác nào lúc này.'}</p>
              )}
              <Link to={`/dai-dien/buoi/${r.tourId}`} className="rp-link" style={{ alignSelf: 'flex-start', marginTop: 4 }}>Xem thông tin buổi</Link>
            </div>
          </div>

          <div className="rp-card">
            <div className="rp-card-title">Thông tin đoàn</div>
            <dl className="rp-dl">
              <div><dt>Trường</dt><dd>{r.schoolName}</dd></div>
              <div><dt>Liên hệ</dt><dd>{r.representativeName}</dd></div>
              <div><dt>Email</dt><dd>{r.contactEmail}</dd></div>
            </dl>
            {r.state === 'Approved' && <p className="rp-muted" style={{ fontSize: 12, marginTop: 10 }}>Đã duyệt: muốn đổi email hoặc thông tin đoàn, liên hệ Admin.</p>}
          </div>

          <div className="rp-card">
            <div className="rp-card-title">Lịch sử</div>
            <ol className="rp-timeline">
              {r.history.map((h, i) => (
                <li key={i}><div><time>{formatDateTime(h.at)}</time><p>{h.text}</p></div></li>
              ))}
            </ol>
          </div>
        </aside>
      </div>

      <ConfirmDialog
        open={confirmCancel}
        title="Hủy đăng ký này?"
        confirmLabel="Hủy đăng ký"
        danger
        busy={cancel.isPending}
        onConfirm={doCancel}
        onClose={() => setConfirmCancel(false)}
      >
        <p>
          Đoàn {r.schoolName} sẽ không còn trong buổi {r.tourName}.
          {r.state === 'Approved' ? ' Học sinh đang giữ mã đoàn sẽ không vào được nữa.' : ''} Bạn có thể đăng ký lại khi buổi còn nhận đăng ký; khi đó Admin phải duyệt lại.
        </p>
      </ConfirmDialog>
      <Toast message={flash} onDone={clearFlash} />
    </div>
  )
}

function StatusCallout({ r }: { r: RepresentativeRegistrationDetail }) {
  if (r.state === 'Submitted') {
    return (
      <div className="rp-callout rp-callout--warn">
        <Clock size={18} />
        <div>
          <b>{r.resubmittedAfterApproval ? 'Danh sách mới đang chờ duyệt lại' : 'Đang chờ Admin duyệt'}</b>
          <p>
            {r.resubmittedAfterApproval
              ? 'Mã đoàn tạm thời chưa cấp quyền mới. Học sinh đã ở phòng chờ sẽ thấy “Danh sách đang được cập nhật” cho tới khi Admin duyệt.'
              : 'Bạn vẫn sửa hoặc hủy được khi buổi còn nhận đăng ký. Kết quả duyệt sẽ hiện ngay tại đây.'}
          </p>
        </div>
      </div>
    )
  }
  if (r.state === 'Rejected') {
    return (
      <div className="rp-callout rp-callout--danger" role="status">
        <AlertTriangle size={18} />
        <div>
          <b>Admin đã từ chối đăng ký</b>
          <p>{r.rejectionReason ?? 'Không có lý do kèm theo.'}</p>
          {r.allowedActions.edit.allowed && (
            <div className="rp-callout__actions"><Link to={`/dai-dien/dang-ky/${r.id}/sua`} className="rp-chip-btn rp-chip-btn--dark">Sửa và gửi lại</Link></div>
          )}
        </div>
      </div>
    )
  }
  if (r.state === 'Cancelled') {
    return (
      <div className="rp-callout">
        <Info size={18} />
        <div>
          <b>Đăng ký đã hủy</b>
          <p>{r.allowedActions.reRegister.allowed ? 'Buổi vẫn nhận đăng ký. Đăng ký lại sẽ dùng lại bản ghi này và chờ Admin duyệt.' : 'Buổi không còn nhận đăng ký.'}</p>
        </div>
      </div>
    )
  }
  if (!r.participation) {
    return (
      <div className="rp-callout rp-callout--accent">
        <Check size={18} />
        <div><b>Đăng ký đã được duyệt</b><p>Buổi đã kết thúc nên đường dẫn và mã đoàn không còn dùng được.</p></div>
      </div>
    )
  }
  return null
}

function Participation({ r }: { r: RepresentativeRegistrationDetail }) {
  const p = r.participation!
  const { copied, copy } = useCopy()
  const message = studentMessage({ tourName: r.tourName, scheduledAt: r.tourScheduledAt, joinLink: p.joinLink, groupCode: p.groupCode, schoolName: r.schoolName })
  return (
    <section className="rp-invite" aria-labelledby="invite-title">
      <div>
        <div className="rp-card-title"><span>Thông tin tham gia</span><span>Đã duyệt</span></div>
        <h3 id="invite-title">Chia sẻ đường dẫn và mã đoàn cho học sinh</h3>
      </div>
      <div className="rp-copy">
        <div style={{ minWidth: 0 }}><span className="rp-mono">Đường dẫn</span><code>{p.joinLink}</code></div>
        <button type="button" onClick={() => void copy('link', p.joinLink)}>{copied === 'link' ? <Check size={14} /> : <Copy size={14} />}{copied === 'link' ? 'Đã sao chép' : 'Sao chép'}</button>
      </div>
      <div className="rp-copy">
        <div><span className="rp-mono">Mã đoàn</span><code className="rp-code">{p.groupCode}</code></div>
        <button type="button" onClick={() => void copy('code', p.groupCode)}>{copied === 'code' ? <Check size={14} /> : <Copy size={14} />}{copied === 'code' ? 'Đã sao chép' : 'Sao chép'}</button>
      </div>
      <ol>{p.instructions.map((line) => <li key={line}>{line}</li>)}</ol>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
        <span className="rp-invite__email">
          <Mail size={14} />
          {p.emailSentAt ? `Email đã được dịch vụ gửi đi lúc ${formatDateTime(p.emailSentAt)} tới ${r.contactEmail}.` : 'Admin chưa gửi email. Bạn vẫn có thể sao chép thông tin ở đây.'}
        </span>
        <button type="button" className="rp-chip-btn" onClick={() => void copy('message', message)}>
          {copied === 'message' ? <Check size={14} /> : <Copy size={14} />}
          {copied === 'message' ? 'Đã sao chép lời nhắn' : 'Sao chép lời nhắn cho học sinh'}
        </button>
      </div>
    </section>
  )
}
