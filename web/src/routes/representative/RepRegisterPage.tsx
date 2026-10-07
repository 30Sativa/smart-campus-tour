import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useAuthStore } from '../../stores/auth-store'
import { useRepRegistration, useRepTour, useSubmitRegistration, useUpdateRegistration, useResubmitRegistration } from '../../features/representative/representative-hooks'
import type { RegistrationInput, RepresentativeRegistration, RepresentativeTour } from '../../features/representative/api/types'
import { RepPage, RepPageHeader, Panel, InfoList, Callout, PageSkeleton, ErrorState, Spinner } from '../../features/representative/components/RepUi'
import { ExcelUploader } from '../../features/representative/components/ExcelUploader'
import type { AcceptedRoster } from '../../features/representative/components/ExcelUploader'
import { RosterPreview } from '../../features/representative/components/RosterPreview'
import { RegistrationStepper } from '../../features/representative/components/RegistrationStepper'
import { downloadBytes, rosterWorkbookBytes } from '../../features/representative/roster-import'
import { formatDateTime, readRepError } from '../../features/representative/rep-format'
import { TOUR_IMAGES, repButton } from '../../features/representative/rep-classes'

export default function RepRegisterPage() {
  const { tourId, registrationId } = useParams()
  const owner = useAuthStore(s => s.user?.userId)
  const registration = useRepRegistration(registrationId)
  const tour = useRepTour(registration.data?.summary.tourId ?? tourId ?? '')
  const [revision, setRevision] = useState(0)
  if ((registrationId && registration.isPending && !registration.error) || (!registrationId && tour.isPending) ||
    (Boolean(registration.data) && tour.isPending)) return <PageSkeleton />
  if ((registrationId && !registration.data) || !tour.data) return <RepPage><ErrorState title="Không mở được đăng ký" message={readRepError(registration.error ?? tour.error).message} back={{ to: '/dai-dien/dang-ky', label: 'Đăng ký của tôi' }} /></RepPage>
  const r = registration.data
  const gate = r ? (r.allowedActions.edit.allowed ? r.allowedActions.edit : r.allowedActions.resubmit) : tour.data.register
  if (!gate.allowed) return <RepPage><Callout title="Chưa thể thay đổi đăng ký">{gate.reason}</Callout></RepPage>
  return <RegistrationForm key={`${owner}:${registrationId ?? tourId}:${revision}`} tour={tour.data} registration={r} onReload={async () => {
    const result = await tour.refetch()
    const detail = registrationId ? await registration.refetch() : undefined
    if (!result.error && !detail?.error) setRevision(v => v + 1)
  }} />
}

type Contact = Pick<RegistrationInput, 'schoolName' | 'groupName' | 'contactName' | 'contactEmail'>
const fields: { key: keyof Contact; label: string; max: number; type?: string }[] = [
  { key: 'schoolName', label: 'Tên trường', max: 200 }, { key: 'groupName', label: 'Tên đoàn', max: 200 },
  { key: 'contactName', label: 'Người liên hệ', max: 150 }, { key: 'contactEmail', label: 'Email liên hệ', max: 254, type: 'email' },
]

function RegistrationForm({ tour, registration, onReload }: { tour: RepresentativeTour; registration?: RepresentativeRegistration; onReload: () => Promise<void> }) {
  const navigate = useNavigate()
  const submit = useSubmitRegistration()
  const update = useUpdateRegistration()
  const resubmitMutation = useResubmitRegistration()
  // Freeze the opened draft and its versions. Background polling must not authorize it with newer versions.
  const [base] = useState({ tour, registration })
  const [values, setValues] = useState<Contact>(() => ({
    schoolName: registration?.summary.schoolName ?? '', groupName: registration?.summary.groupName ?? '',
    contactName: registration?.contactName ?? '', contactEmail: registration?.contactEmail ?? '',
  }))
  const [accepted, setAccepted] = useState<AcceptedRoster | null>(null)
  const [step, setStep] = useState(0)
  const [error, setError] = useState<{ message: string; details?: string[]; stale?: boolean } | null>(null)
  const [attempt, setAttempt] = useState<{ requestId: string; input: RegistrationInput } | null>(null)
  // UI flow §4.1: the Representative confirms the right to provide this data on every create/edit (not persisted).
  const [confirmed, setConfirmed] = useState(false)
  const busy = submit.isPending || update.isPending || resubmitMutation.isPending
  const rows = accepted?.rows ?? base.registration?.roster ?? []
  const resubmit = Boolean(base.registration && base.registration.allowedActions.resubmit.allowed)
  const title = !base.registration ? 'Đăng ký đoàn' : resubmit ? 'Sửa và gửi lại đăng ký' : 'Sửa đăng ký'
  async function send() {
    setError(null)
    const next = attempt ?? { requestId: crypto.randomUUID(), input: {
      ...values, roster: rows, expectedTourRowVersion: base.registration?.tourRowVersion ?? base.tour.rowVersion,
    } }
    if (!base.registration) setAttempt(next)
    try {
      const id = base.registration ? (await (resubmit
        ? resubmitMutation.mutateAsync({ id: base.registration.summary.id, input: next.input, version: base.registration.rowVersion })
        : update.mutateAsync({ id: base.registration.summary.id, input: next.input, version: base.registration.rowVersion })), base.registration.summary.id) :
        (await submit.mutateAsync({ tourId: base.tour.id, input: next.input, requestId: next.requestId })).id
      // A new registration lands on its detail page with the "sent" ticket.
      navigate(`/dai-dien/dang-ky/${id}`, { replace: true, state: base.registration ? undefined : { justSent: true } })
    } catch (failure) {
      const problem = readRepError(failure)
      // Only a definite refusal permits editing the intent. An uncertain create retries the same key and payload.
      if (problem.status && problem.status >= 400 && problem.status < 500) setAttempt(null)
      setError({ message: problem.message, stale: problem.status === 409 && problem.code !== 'EMAIL_RESERVED', details: Object.entries(problem.fieldErrors).map(([key, value]) => {
        const contact = fields.find(f => key.toLowerCase().endsWith(f.key.toLowerCase()))
        const index = /Roster\[(\d+)\]/i.exec(key)
        return `${contact?.label ?? (index ? 'Dòng ' + (next.input.roster[Number(index[1])]?.rowNumber ?? '?') : 'Danh sách')}: ${value}`
      }) })
    }
  }
  return <RepPage>
    <RepPageHeader back={{ to: base.registration ? `/dai-dien/dang-ky/${base.registration.summary.id}` : `/dai-dien/buoi/${tour.id}`, label: 'Quay lại' }}
      kicker={base.registration ? 'Đăng ký của tôi' : 'Đăng ký đoàn'} title={title} description={`${base.tour.name}, ${formatDateTime(base.tour.scheduledStartAt)}`} />
    <div className="rep-form-grid"><div style={{ minWidth: 0 }}>
    <div><RegistrationStepper steps={['Thông tin đoàn', 'Danh sách lời mời', 'Kiểm tra và gửi']} current={step} onSelect={busy || attempt ? undefined : setStep} /></div>
    {error && <div style={{ marginBottom: 20 }}><Callout tone="danger" title={error.message} role="alert"
      actions={error.stale && !attempt ? <button type="button" className={repButton('secondary', 'sm')} onClick={() => void onReload()}>Tải lại dữ liệu và bắt đầu lại</button> : undefined}>
      {error.details?.length ? <ul>{error.details.map((d, i) => <li key={i}>{d}</li>)}</ul> : null}
    </Callout></div>}
    {attempt && !busy && <div style={{ marginBottom: 20 }}><Callout title="Lần gửi trước chưa được xác nhận">Thử gửi lại với cùng thông tin để tránh tạo trùng đoàn.</Callout></div>}
    <form onSubmit={e => {
      e.preventDefault()
      if (busy) return
      if (step === 0) { setError(null); setStep(1) }
      else if (step === 1) {
        if (!rows.length) setError({ message: 'Xác nhận ít nhất một dòng lời mời trước khi tiếp tục.' })
        else { setError(null); setStep(2) }
      } else if (!confirmed) setError({ message: 'Xác nhận quyền cung cấp thông tin đăng ký trước khi gửi.' })
      else void send()
    }}>
      <fieldset disabled={busy || Boolean(attempt)} style={{ minWidth: 0, border: 0, margin: 0, padding: 0 }}>
        {step === 0 && <div className="rep-pane" key="contact"><Panel title="Thông tin đoàn"><div className="rep-fields">{fields.map(f =>
          <label key={f.key} className="rep-field">{f.label}<span aria-hidden="true"> *</span>
            <input required type={f.type ?? 'text'} maxLength={f.max} className="rep-input" value={values[f.key]} onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))} />
          </label>)}</div><p className="rep-hint" style={{ marginTop: 16 }}>Email liên hệ của đoàn không thay thế email riêng của từng dòng lời mời.</p></Panel></div>}
        {step === 1 && <div className="rep-pane" key="roster"><Panel title="Danh sách lời mời">
          {base.registration && <button type="button" className={repButton('secondary', 'sm')} style={{ marginBottom: 16 }} onClick={() => downloadBytes('CampusTour-danh-sach-hien-tai.xlsx', rosterWorkbookBytes(base.registration!.roster))}>Tải danh sách hiện tại</button>}
          <ExcelUploader accepted={accepted} onAccept={setAccepted} inUse={base.registration ? { count: base.registration.roster.length } : null} />
          {base.registration && !accepted && <div style={{ marginTop: 20 }}><RosterPreview rows={rows} /></div>}
        </Panel></div>}
        {step === 2 && <div className="rep-pane rep-stack" key="review"><Panel title="Kiểm tra trước khi gửi">
          <InfoList items={fields.map(f => ({ label: f.label, value: values[f.key] }))} />
          <p className="rep-lead" style={{ marginTop: 18, fontSize: 14 }}><b className="num">{rows.filter(r => r.rowType === 'INDIVIDUAL').length}</b> lời mời cá nhân, <b className="num">{rows.filter(r => r.rowType === 'SHARED_VIEWING').length}</b> điểm xem chung.</p>
        </Panel><Panel title="Danh sách gửi Admin"><RosterPreview rows={rows} /></Panel>
          <Callout title="Gửi để Admin duyệt">Chưa cấp mã truy cập khi gửi đăng ký. Học sinh không cần tài khoản ứng dụng; lời mời cá nhân và điểm xem chung sẽ được xử lý sau duyệt.</Callout>
          <Panel title="Mục đích dữ liệu">
            <p className="rep-lead" style={{ fontSize: 14 }}>Thông tin trường, người liên hệ và danh sách lời mời chỉ dùng để tổ chức đăng ký, gửi lời mời và thống kê vận hành buổi tham quan. Không dùng để liên hệ tuyển sinh sau buổi.</p>
            <label className="rep-consent">
              <input type="checkbox" required checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />
              Tôi xác nhận có quyền cung cấp thông tin đăng ký và email lời mời trong danh sách này.
            </label>
          </Panel></div>}
      </fieldset>
      <div className="rep-form-foot">
        <button type="button" className={repButton('secondary')} disabled={busy || Boolean(attempt) || step === 0} onClick={() => { setError(null); setStep(s => s - 1) }}>Quay lại bước trước</button>
        <button type="submit" className={repButton('dark')} disabled={busy || Boolean(error?.stale)}>
          {busy && <Spinner />}{busy ? 'Đang gửi...' : step === 2 ? attempt ? 'Thử gửi lại' : base.registration ? resubmit ? 'Gửi lại đăng ký' : 'Lưu thay đổi' : 'Gửi đăng ký' : 'Tiếp tục'}
        </button>
      </div>
    </form>
    </div>
    <aside className="rep-aside" aria-label="Buổi tham quan đang đăng ký">
      <img className="rep-aside-img" src={TOUR_IMAGES[0]} alt="" />
      <h2>{base.tour.name}</h2>
      <dl className="rep-info">
        <div><dt>Thời gian dự kiến</dt><dd>{formatDateTime(base.tour.scheduledStartAt)}</dd></div>
        <div><dt>Tuyến tham quan</dt><dd>{base.tour.routeName} · {base.tour.stops.length} điểm</dd></div>
      </dl>
      <p className="rep-hint">Ba bước: thông tin đoàn, file Excel danh sách, kiểm tra và gửi. Admin duyệt xong, lời mời mới được gửi tới học sinh.</p>
    </aside>
    </div>
  </RepPage>
}
