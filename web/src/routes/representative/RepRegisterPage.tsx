import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowLeft, Info } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router'
import type { RegistrationInput, RepresentativeRegistrationDetail, RepresentativeTour } from '../../api/contracts/representative'
import { Loading, Pill, RegistrationChip } from '../../features/representative/components/RepUi'
import { RosterImporter, RosterTable } from '../../features/representative/components/RosterImporter'
import { useRepRegistration, useRepTour, useSubmitRegistration, useUpdateRegistration } from '../../features/representative/representative-hooks'
import { formatDateTime, readRepError } from '../../features/representative/rep-format'
import type { RepError } from '../../features/representative/rep-format'
import type { ImportResult } from '../../features/representative/roster-import'
import { currentRepresentativeProfile } from '../../mocks/representative-mock'

/**
 * Register / Edit (flow review §4.1):
 *
 *   new         first registration for a Scheduled Tour
 *   reregister  the same record after the representative cancelled it
 *   edit        Submitted: still waiting, change anything
 *   resubmit    Rejected: fix what Admin asked for and send again
 *   replace     Approved: only the roster changes, and it goes back to review
 *
 * Three steps: group info → roster (template, import, preview) → confirm.
 * Nothing is sent before the last step; a refusal reloads the data and says why.
 */
type Mode = 'new' | 'reregister' | 'edit' | 'resubmit' | 'replace'

const MODE_TEXT: Record<Mode, { kicker: string; title: string; submit: string; done: string }> = {
  new: { kicker: 'Đăng ký đoàn mới', title: 'Đăng ký đoàn', submit: 'Gửi đăng ký', done: 'Đã gửi đăng ký. Admin sẽ duyệt danh sách.' },
  reregister: { kicker: 'Đăng ký lại', title: 'Đăng ký lại đoàn', submit: 'Gửi đăng ký lại', done: 'Đã đăng ký lại. Đăng ký về Chờ duyệt.' },
  edit: { kicker: 'Sửa đăng ký chờ duyệt', title: 'Sửa đăng ký', submit: 'Lưu thay đổi', done: 'Đã lưu. Đăng ký vẫn Chờ duyệt.' },
  resubmit: { kicker: 'Sửa và gửi lại', title: 'Sửa và gửi lại', submit: 'Gửi lại để duyệt', done: 'Đã gửi lại. Đăng ký về Chờ duyệt.' },
  replace: { kicker: 'Thay danh sách đã duyệt', title: 'Thay danh sách học sinh', submit: 'Gửi danh sách mới', done: 'Đã gửi danh sách mới. Đăng ký về Chờ duyệt lại.' },
}

const STEPS = ['Thông tin đoàn', 'Danh sách học sinh', 'Xác nhận và gửi']

function newRequestId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `req-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export default function RepRegisterPage() {
  const { tourId: tourParam, registrationId } = useParams()
  const registration = useRepRegistration(registrationId)
  const tourId = tourParam ?? registration.data?.tourId ?? ''
  const tour = useRepTour(tourId)

  if (registration.isLoading || tour.isLoading || (registrationId && !registration.data && !registration.isError)) {
    return <div className="rp-ctn"><Loading /></div>
  }
  const loadError = registration.error ?? tour.error
  if (loadError || !tour.data) {
    return (
      <div className="rp-ctn rp-section">
        <div className="rp-callout rp-callout--red" role="alert">
          <div>
            <b>Không mở được trang đăng ký</b>
            <p>{readRepError(loadError).message}</p>
            <div className="rp-callout__actions"><Link to="/dai-dien" className="rp-chip-btn">Về danh sách buổi</Link></div>
          </div>
        </div>
      </div>
    )
  }
  return <RegisterForm key={`${tour.data.id}:${registration.data?.id ?? 'new'}`} tour={tour.data} registration={registration.data ?? null} />
}

function modeOf(tour: RepresentativeTour, reg: RepresentativeRegistrationDetail | null): Mode | null {
  if (!reg) return tour.myRegistrationState === 'Cancelled' ? 'reregister' : tour.register.allowed ? 'new' : null
  if (reg.state === 'Submitted') return reg.allowedActions.edit.allowed ? 'edit' : null
  if (reg.state === 'Rejected') return reg.allowedActions.edit.allowed ? 'resubmit' : null
  if (reg.state === 'Approved') return reg.allowedActions.replaceRoster.allowed ? 'replace' : null
  return null
}

function RegisterForm({ tour, registration }: { tour: RepresentativeTour; registration: RepresentativeRegistrationDetail | null }) {
  const navigate = useNavigate()
  const submit = useSubmitRegistration()
  const update = useUpdateRegistration()
  const profile = useMemo(() => currentRepresentativeProfile(), [])
  const mode = modeOf(tour, registration)

  const [step, setStep] = useState(0)
  const [schoolName, setSchoolName] = useState(registration?.schoolName ?? profile.schoolName)
  const [representativeName, setRepresentativeName] = useState(registration?.representativeName ?? profile.representativeName)
  const [contactEmail, setContactEmail] = useState(registration?.contactEmail ?? profile.contactEmail)
  const [imported, setImported] = useState<ImportResult | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [error, setError] = useState<RepError | null>(null)
  const [localErrors, setLocalErrors] = useState<Partial<Record<keyof RegistrationInput, string>>>({})
  const [requestId] = useState(newRequestId)

  useEffect(() => {
    window.scrollTo?.({ top: 0, behavior: 'smooth' })
  }, [step])

  // A registration that went Cancelled is re-registered from the Tour page.
  if (registration?.state === 'Cancelled') {
    return (
      <div className="rp-ctn rp-section">
        <div className="rp-callout rp-callout--blue">
          <Info size={18} />
          <div>
            <b>Đăng ký này đã hủy</b>
            <p>Đăng ký lại từ trang của buổi tham quan.</p>
            <div className="rp-callout__actions"><Link to={`/dai-dien/buoi/${tour.id}/dang-ky`} className="rp-chip-btn">Đăng ký lại</Link></div>
          </div>
        </div>
      </div>
    )
  }

  if (!mode) {
    const why = registration
      ? registration.allowedActions.edit.reason ?? registration.allowedActions.replaceRoster.reason
      : tour.register.reason
    return (
      <div className="rp-ctn rp-section">
        <div className="rp-callout rp-callout--blue" role="status">
          <Info size={18} />
          <div>
            <b>Không sửa được đăng ký lúc này</b>
            <p>{why ?? 'Buổi không còn nhận thay đổi.'}</p>
            <div className="rp-callout__actions">
              {registration || tour.myRegistrationId ? (
                <Link to={`/dai-dien/dang-ky/${registration?.id ?? tour.myRegistrationId}`} className="rp-chip-btn">Mở đăng ký của tôi</Link>
              ) : (
                <Link to={`/dai-dien/buoi/${tour.id}`} className="rp-chip-btn">Về trang buổi</Link>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  const text = MODE_TEXT[mode]
  const lockedInfo = mode === 'replace'
  const keepsRoster = (mode === 'edit' || mode === 'resubmit') && !imported
  const newRoster = imported?.ok ? imported.rows : null
  const roster = newRoster ?? (keepsRoster ? registration?.roster ?? [] : [])
  const busy = submit.isPending || update.isPending
  const fieldErrors = { ...localErrors, ...(error?.fieldErrors ?? {}) }

  const checkInfo = () => {
    const errs: Partial<Record<keyof RegistrationInput, string>> = {}
    if (!schoolName.trim()) errs.schoolName = 'Nhập tên trường / đoàn.'
    if (!representativeName.trim()) errs.representativeName = 'Nhập họ tên người liên hệ.'
    if (!contactEmail.trim()) errs.contactEmail = 'Nhập email liên hệ.'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail.trim())) errs.contactEmail = 'Email chưa đúng định dạng.'
    setLocalErrors(errs)
    return Object.keys(errs).length === 0
  }

  const checkRoster = () => {
    if (roster.length === 0) {
      setLocalErrors({ roster: imported && !imported.ok ? 'File đang có lỗi. Sửa file rồi tải lại.' : 'Tải lên file danh sách học sinh.' })
      return false
    }
    setLocalErrors({})
    return true
  }

  const next = () => {
    setError(null)
    if (step === 0 && !checkInfo()) return
    if (step === 1 && !checkRoster()) return
    setStep((s) => Math.min(s + 1, 2))
  }

  const send = () => {
    setError(null)
    const input: RegistrationInput = { schoolName: schoolName.trim(), representativeName: representativeName.trim(), contactEmail: contactEmail.trim(), roster }
    const onError = (e: unknown) => {
      const err = readRepError(e)
      setError(err)
      if (err.fieldErrors.schoolName || err.fieldErrors.representativeName || err.fieldErrors.contactEmail) setStep(0)
      else if (err.fieldErrors.roster) setStep(1)
    }
    const onSuccess = (saved: { id: string }) => navigate(`/dai-dien/dang-ky/${saved.id}`, { state: { flash: text.done } })
    if (mode === 'new' || mode === 'reregister') submit.mutate({ tourId: tour.id, input, requestId }, { onSuccess, onError })
    else if (registration) update.mutate({ id: registration.id, input, version: registration.version }, { onSuccess, onError })
  }

  const errorBanner = error && (
    <div className={error.code === 'StaleData' || error.code === 'NotAllowed' ? 'rp-callout rp-callout--amber' : 'rp-callout rp-callout--red'} role="alert">
      <AlertTriangle size={18} />
      <div>
        <b>{error.code === 'StaleData' ? 'Dữ liệu đã thay đổi' : error.code === 'NotAllowed' ? 'Không lưu được' : 'Chưa gửi được'}</b>
        <p>{error.message} {error.code === 'StaleData' || error.code === 'NotAllowed' ? 'Trang đã tải lại dữ liệu mới nhất; không có gì được lưu một phần.' : ''}</p>
        {error.code === 'NotAllowed' && (
          <div className="rp-callout__actions"><Link to={registration ? `/dai-dien/dang-ky/${registration.id}` : `/dai-dien/buoi/${tour.id}`} className="rp-chip-btn">Xem trạng thái hiện tại</Link></div>
        )}
      </div>
    </div>
  )

  return (
    <div className="rp-ctn">
      <section className="rp-band" style={{ minHeight: 0 }}>
        <img src="/images/booking-app.avif" alt="" aria-hidden="true" />
        <div className="rp-band__top">
          <Link to={registration ? `/dai-dien/dang-ky/${registration.id}` : `/dai-dien/buoi/${tour.id}`} className="rp-back"><ArrowLeft size={14} />Quay lại</Link>
          {registration && <RegistrationChip state={registration.state} />}
        </div>
        <div>
          <span className="rp-kicker">{text.kicker}</span>
          <h1 style={{ marginTop: 12 }}>{text.title}</h1>
          <p className="rp-band__lead">{tour.name} · {formatDateTime(tour.scheduledAt)} · {tour.code}</p>
        </div>
      </section>

      <ol className="rp-stepper" aria-label="Các bước đăng ký">
        {STEPS.map((label, i) => (
          <li key={label} className={i === step ? 'is-current' : i < step ? 'is-done' : ''} aria-current={i === step ? 'step' : undefined}>
            <b>{i < step ? '✓' : String(i + 1).padStart(2, '0')}</b>
            {label}
          </li>
        ))}
      </ol>

      <div className="rp-layout">
        <div className="rp-stack">
          {errorBanner}

          {mode === 'replace' && step < 2 && (
            <div className="rp-callout rp-callout--amber">
              <AlertTriangle size={18} />
              <div>
                <b>Đăng ký sẽ về Chờ duyệt</b>
                <p>Khi gửi danh sách mới, Admin phải duyệt lại. Học sinh đã vào phòng chờ sẽ thấy “Danh sách đang được cập nhật”; em nào không còn trong danh sách mới sẽ phải nhập lại thông tin hoặc bị từ chối.</p>
              </div>
            </div>
          )}
          {mode === 'resubmit' && registration?.rejectionReason && step < 2 && (
            <div className="rp-callout rp-callout--red">
              <AlertTriangle size={18} />
              <div><b>Lý do Admin từ chối</b><p>{registration.rejectionReason}</p></div>
            </div>
          )}

          {step === 0 && (
            <div className="rp-card rp-form">
              <div className="rp-card-title">01 · Thông tin đoàn</div>
              <div className="rp-field">
                <label htmlFor="rp-school">Tên trường / đoàn <span>*</span></label>
                <input id="rp-school" value={schoolName} onChange={(e) => setSchoolName(e.target.value)} disabled={lockedInfo} aria-invalid={Boolean(fieldErrors.schoolName)} autoComplete="organization" />
                {fieldErrors.schoolName && <small className="rp-err">{fieldErrors.schoolName}</small>}
              </div>
              <div className="rp-grid2">
                <div className="rp-field">
                  <label htmlFor="rp-rep">Người liên hệ <span>*</span></label>
                  <input id="rp-rep" value={representativeName} onChange={(e) => setRepresentativeName(e.target.value)} disabled={lockedInfo} aria-invalid={Boolean(fieldErrors.representativeName)} autoComplete="name" />
                  {fieldErrors.representativeName && <small className="rp-err">{fieldErrors.representativeName}</small>}
                </div>
                <div className="rp-field">
                  <label htmlFor="rp-email">Email nhận thông tin tham gia <span>*</span></label>
                  <input id="rp-email" type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} disabled={lockedInfo} aria-invalid={Boolean(fieldErrors.contactEmail)} autoComplete="email" />
                  {fieldErrors.contactEmail ? <small className="rp-err">{fieldErrors.contactEmail}</small> : <small>Admin gửi đường dẫn và mã đoàn tới địa chỉ này sau khi duyệt.</small>}
                </div>
              </div>
              {lockedInfo && <p className="rp-muted" style={{ fontSize: 13 }}>Đăng ký đã duyệt: chỉ thay được danh sách học sinh. Muốn đổi email hoặc thông tin đoàn, liên hệ Admin.</p>}
            </div>
          )}

          {step === 1 && (
            <div className="rp-card rp-form">
              <div className="rp-card-title">02 · Danh sách học sinh</div>
              {(mode === 'edit' || mode === 'resubmit') && registration && (
                <div className="rp-callout rp-callout--blue">
                  <Info size={18} />
                  <div>
                    <b>{imported?.ok ? 'Sẽ dùng danh sách mới' : `Đang giữ danh sách hiện tại (${registration.roster.length} học sinh)`}</b>
                    <p>Không cần tải file nếu danh sách không đổi. Tải file mới sẽ thay toàn bộ danh sách hiện tại.</p>
                  </div>
                </div>
              )}
              <RosterImporter
                result={imported}
                onResult={(r) => {
                  setImported(r)
                  setLocalErrors({})
                }}
                currentCount={registration?.roster.length}
                fieldError={fieldErrors.roster}
              />
            </div>
          )}

          {step === 2 && (
            <div className="rp-card rp-form">
              <div className="rp-card-title">03 · Xác nhận</div>
              <dl className="rp-dl">
                <div><dt>Buổi</dt><dd>{tour.name} · {formatDateTime(tour.scheduledAt)}</dd></div>
                <div><dt>Trường / đoàn</dt><dd>{schoolName}</dd></div>
                <div><dt>Người liên hệ</dt><dd>{representativeName}</dd></div>
                <div><dt>Email</dt><dd>{contactEmail}</dd></div>
                <div><dt>Danh sách</dt><dd>{roster.length} học sinh · {roster.filter((r) => r.className).length} dòng có lớp {newRoster ? `(từ ${imported?.fileName})` : '(giữ danh sách hiện tại)'}</dd></div>
              </dl>
              <RosterTable rows={roster} searchable={roster.length > 12} />
              <label className="rp-check">
                <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
                <span>Tôi xác nhận danh sách đúng học sinh của đoàn. {mode === 'replace' || newRoster ? 'Danh sách này thay toàn bộ danh sách cũ. ' : ''}Sau khi gửi, đăng ký ở trạng thái Chờ duyệt.</span>
              </label>
            </div>
          )}

          <div className="rp-form-actions">
            {step > 0 ? (
              <button type="button" className="rp-chip-btn" onClick={() => setStep((s) => s - 1)} disabled={busy}>
                <ArrowLeft size={14} />Bước trước
              </button>
            ) : <span />}
            {step < 2 ? (
              <Pill onClick={next}>Tiếp tục</Pill>
            ) : (
              <Pill onClick={send} disabled={!confirmed} busy={busy}>{text.submit}</Pill>
            )}
          </div>
        </div>

        <aside className="rp-stack">
          <div className="rp-card rp-card--cream">
            <div className="rp-card-title">Quy tắc danh sách</div>
            <ul className="rp-stack" style={{ gap: 10, fontSize: 14 }}>
              <li><b>HoTen</b> bắt buộc; <b>Lop</b> điền nếu trường quản lý theo lớp. Học sinh phải nhập lớp khi vào phiên nếu dòng của em có lớp.</li>
              <li>Dòng trống hoàn toàn được bỏ qua. Tên trùng vẫn giữ nguyên, hệ thống không tự gộp.</li>
              <li>Một dòng lỗi thì cả file không được nhập; danh sách và trạng thái cũ giữ nguyên.</li>
              <li>Chỉ ghi họ tên và lớp. Không cần số điện thoại, mã học sinh hay ngày sinh.</li>
            </ul>
          </div>
          <div className="rp-card">
            <div className="rp-card-title">Sau khi gửi</div>
            <ol className="rp-stops">
              <li className="rp-stop"><em>01</em><span>Admin xem danh sách, duyệt hoặc từ chối kèm lý do.</span></li>
              <li className="rp-stop"><em>02</em><span>Đã duyệt: bạn thấy đường dẫn và mã đoàn ngay trên trang, kèm email.</span></li>
              <li className="rp-stop"><em>03</em><span>Chia sẻ cho học sinh. Khi Admin chốt danh sách, đăng ký bị khóa.</span></li>
            </ol>
          </div>
        </aside>
      </div>
    </div>
  )
}
