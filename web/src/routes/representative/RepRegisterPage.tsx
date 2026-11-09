import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useAuthStore } from '../../stores/auth-store'
import { useRepRegistration, useRepRegistrations, useRepTour, useSubmitRegistration, useUpdateRegistration, useResubmitRegistration } from '../../features/representative/representative-hooks'
import type { RegistrationInput, RegistrationSummary, RepresentativeRegistration, RepresentativeTour } from '../../features/representative/api/types'
import { RepPage, RepPageHeader, Panel, InfoList, Callout, PageSkeleton, ErrorState, Spinner } from '../../features/representative/components/RepUi'
import { ExcelUploader } from '../../features/representative/components/ExcelUploader'
import type { AcceptedRoster } from '../../features/representative/components/ExcelUploader'
import { RosterPreview } from '../../features/registrations/RosterPreview'
import { RegistrationStepper } from '../../features/representative/components/RegistrationStepper'
import { downloadBytes, rosterWorkbookBytes } from '../../features/representative/roster-import'
import { matchRosterIdentities, rosterInput, rosterReplacement } from '../../features/representative/registration-roster'
import { newRosterRowsAllowed, registrationClosesAt } from '../../features/representative/registration-deadline'
import { formatDateTime, readRepError } from '../../features/representative/rep-format'
import { repButton } from '../../features/representative/rep-classes'

export default function RepRegisterPage() {
  const { tourId, registrationId } = useParams()
  const owner = useAuthStore(s => s.user?.userId)
  const registration = useRepRegistration(registrationId)
  const tour = useRepTour(registration.data?.summary.tourId ?? tourId ?? '')
  const [revision, setRevision] = useState(0)
  if ((registrationId && registration.isPending && !registration.error) || (!registrationId && tour.isPending) || (Boolean(registration.data) && tour.isPending)) return <PageSkeleton />
  if ((registrationId && !registration.data) || !tour.data) return <RepPage><ErrorState title="Không mở được đăng ký" message={readRepError(registration.error ?? tour.error).message} back={{ to: '/dai-dien/dang-ky', label: 'Đăng ký của tôi' }} /></RepPage>
  const reload = async () => {
    const result = await tour.refetch()
    const detail = registrationId ? await registration.refetch() : undefined
    if (result.error || detail?.error) throw result.error ?? detail?.error
    setRevision(value => value + 1)
  }
  return registration.data ? <RegistrationForm key={`${owner}:${registrationId}:${revision}`} tour={tour.data} registration={registration.data} onReload={reload} />
    : <CreateAvailability key={`${owner}:${tourId}:${revision}`} tour={tour.data} onReload={reload} />
}

function CreateAvailability({ tour, onReload }: { tour: RepresentativeTour; onReload: () => Promise<void> }) {
  const current = useRepRegistrations({ tourId: tour.id, size: 1 })
  if (!current.isSuccess && !current.data) return current.error ? <RepPage><ErrorState title="Chưa kiểm tra được đăng ký hiện tại" message="Chưa thể xác nhận bạn đã có đăng ký cho buổi này hay chưa." onRetry={() => { void current.refetch() }} /></RepPage> : <PageSkeleton label="Đang kiểm tra đăng ký hiện tại" />
  if (!current.data) return null
  return <CreateAvailabilityReady tour={tour} existing={current.data.data[0]} hasExisting={current.data.pagination.totalItems > 0} onReload={async () => {
    const result = await current.refetch()
    if (result.error) throw result.error
    await onReload()
  }} />
}

function CreateAvailabilityReady({ tour, existing, hasExisting, onReload }: { tour: RepresentativeTour; existing?: RegistrationSummary; hasExisting: boolean; onReload: () => Promise<void> }) {
  // Opening the form starts a draft. A create with an uncertain response may appear in polling;
  // keep the same intent available for retry until success or an explicit reload.
  const [availability] = useState({ existing, hasExisting })
  if (availability.hasExisting) return <RepPage><RepPageHeader title="Bạn đã có đăng ký cho buổi này" description="Mỗi đại diện có một đăng ký cho mỗi buổi tham quan." /><Callout title="Tiếp tục với hồ sơ hiện tại" actions={<Link className={repButton('dark')} to={availability.existing ? `/dai-dien/dang-ky/${availability.existing.id}` : '/dai-dien/dang-ky'}>Mở đăng ký của tôi</Link>}>Bạn có thể xem hồ sơ và thực hiện các thao tác được nhà trường cho phép.</Callout></RepPage>
  return <RegistrationForm tour={tour} onReload={onReload} />
}

type Contact = Pick<RegistrationInput, 'schoolName' | 'groupName' | 'contactName' | 'contactEmail'>
const fields: { key: keyof Contact; label: string; max: number; type?: string }[] = [
  { key: 'schoolName', label: 'Tên trường', max: 200 }, { key: 'groupName', label: 'Tên đoàn', max: 200 },
  { key: 'contactName', label: 'Người liên hệ', max: 150 }, { key: 'contactEmail', label: 'Email liên hệ', max: 254, type: 'email' },
]
type FormError = { message: string; details?: string[]; fields?: Record<string, string>; stale?: boolean }

function RegistrationForm({ tour, registration, onReload }: { tour: RepresentativeTour; registration?: RepresentativeRegistration; onReload: () => Promise<void> }) {
  const navigate = useNavigate()
  const submit = useSubmitRegistration()
  const update = useUpdateRegistration()
  const resubmitMutation = useResubmitRegistration()
  const [base] = useState({ tour, registration })
  const [values, setValues] = useState<Contact>(() => ({ schoolName: registration?.summary.schoolName ?? '', groupName: registration?.summary.groupName ?? '', contactName: registration?.contactName ?? '', contactEmail: registration?.contactEmail ?? '' }))
  const [accepted, setAccepted] = useState<AcceptedRoster | null>(null)
  const [step, setStep] = useState(0)
  const [error, setError] = useState<FormError | null>(null)
  const [attempt, setAttempt] = useState<{ requestId: string; input: RegistrationInput } | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [reloading, setReloading] = useState(false)
  const busy = submit.isPending || update.isPending || resubmitMutation.isPending
  const locked = busy || Boolean(attempt) || Boolean(error?.stale) || reloading
  const existingRows = base.registration?.roster.filter(row => row.participationState !== 'REMOVED') ?? []
  const rows = accepted ? matchRosterIdentities(accepted.rows, existingRows) : existingRows.map(rosterInput)
  const diff = base.registration ? rosterReplacement(existingRows, rows) : null
  // UX only: the server recounts under the Tour lock. Rows this form already holds do not need a new seat.
  const heldHere = existingRows.filter(row => row.participationState === 'PENDING' || row.participationState === 'ACCEPTED').length
  const overSeats = base.tour.remainingSeats != null && rows.length - heldHere > base.tour.remainingSeats
  const seatsMessage = `Danh sách có ${rows.length} dòng, nhưng Tour chỉ còn ${(base.tour.remainingSeats ?? 0) + heldHere} chỗ cho đoàn của bạn. Bớt dòng trước khi tiếp tục.`
  const resubmit = Boolean(base.registration?.allowedActions.resubmit.allowed)
  const gate = base.registration ? resubmit ? base.registration.allowedActions.resubmit : base.registration.allowedActions.edit : base.tour.register
  const title = !base.registration ? 'Đăng ký tham quan' : resubmit ? 'Sửa và gửi lại đăng ký' : 'Chỉnh sửa đăng ký'
  const fieldErrors = Object.fromEntries(fields.map(field => [field.key, Object.entries(error?.fields ?? {}).find(([key]) => key.toLowerCase().endsWith(field.key.toLowerCase()))?.[1]]))
  async function send() {
    if (!attempt) {
      if (diff?.issues.length) { setError({ message: 'Kiểm tra thay đổi danh sách trước khi lưu.', details: diff.issues }); return }
      if (rows.some(row => !row.rowId) && !newRosterRowsAllowed(base.tour)) { setError({ message: 'Đã qua hạn tạo đăng ký hoặc thêm điểm xem mới. Các cập nhật và loại dòng hiện tại vẫn theo quyền của hồ sơ.' }); return }
    }
    setError(null)
    const next = attempt ?? { requestId: crypto.randomUUID(), input: {
      schoolName: values.schoolName, groupName: values.groupName, contactName: values.contactName, contactEmail: values.contactEmail,
      roster: rows.map(rosterInput), expectedTourRowVersion: base.registration?.tourRowVersion ?? base.tour.rowVersion,
    } }
    setAttempt(next)
    try {
      const id = base.registration ? (await (resubmit
        ? resubmitMutation.mutateAsync({ id: base.registration.summary.id, input: next.input, version: base.registration.rowVersion })
        : update.mutateAsync({ id: base.registration.summary.id, input: next.input, version: base.registration.rowVersion })), base.registration.summary.id)
        : (await submit.mutateAsync({ tourId: base.tour.id, input: next.input, requestId: next.requestId })).id
      navigate(`/dai-dien/dang-ky/${id}`, { replace: true, state: base.registration ? undefined : { justSent: true } })
    } catch (failure) {
      const problem = readRepError(failure)
      if (problem.status && problem.status >= 400 && problem.status < 500) setAttempt(null)
      setError({ message: problem.message, fields: problem.fieldErrors, stale: problem.status === 409 && problem.code !== 'EMAIL_RESERVED', details: Object.entries(problem.fieldErrors).filter(([key]) => key !== 'remainingSeats').map(([key, value]) => {
        const index = /Roster\[(\d+)\]/i.exec(key)
        const field = fields.find(item => key.toLowerCase().endsWith(item.key.toLowerCase()))
        return `${field?.label ?? (index ? `Dòng ${next.input.roster[Number(index[1])]?.rowNumber ?? '?'}` : 'Danh sách')}: ${value}`
      }) })
    }
  }
  if (!gate.allowed) return <RepPage><RepPageHeader title={title} back={{ to: base.registration ? `/dai-dien/dang-ky/${base.registration.summary.id}` : `/dai-dien/buoi/${base.tour.id}`, label: 'Quay lại' }} /><Callout title="Chưa thể thay đổi đăng ký">{gate.reason}</Callout></RepPage>
  return <RepPage>
    <RepPageHeader back={{ to: base.registration ? `/dai-dien/dang-ky/${base.registration.summary.id}` : `/dai-dien/buoi/${base.tour.id}`, label: 'Quay lại' }} title={title} description="Kiểm tra thông tin trường, người liên hệ và từng email lời mời." />
    <RegistrationStepper steps={['Thông tin đoàn', 'Danh sách lời mời', 'Kiểm tra và gửi']} current={step} onSelect={locked ? undefined : setStep} />
    <div className="rep-detail"><div className="rep-stack">
      {error && <Callout tone="danger" title={error.message} role="alert" actions={error.stale && !attempt ? <button type="button" className={repButton('secondary', 'sm')} disabled={reloading} onClick={async () => { setReloading(true); try { await onReload() } catch { setError({ ...error, message: 'Không tải lại được dữ liệu. Bản nháp vẫn được giữ; thử tải lại khi kết nối ổn định.' }); setReloading(false) } }}>Tải lại dữ liệu và bắt đầu lại</button> : undefined}>
        {error.details?.length ? <ul>{error.details.map((detail, index) => <li key={index}>{detail}</li>)}</ul> : null}
      </Callout>}
      {attempt && !busy && <Callout title="Lần gửi trước chưa được xác nhận">Thử gửi lại cùng thông tin và phiên bản. Bản nháp được khóa để không đổi nội dung của lần gửi chưa rõ kết quả.</Callout>}
      <form className="rep-stack" onSubmit={event => {
        event.preventDefault()
        if (busy || error?.stale) return
        if (step === 0) { setError(null); setStep(1) }
        else if (step === 1) {
          if (!rows.length) setError({ message: 'Xác nhận ít nhất một dòng lời mời trước khi tiếp tục.' })
          else if (diff?.issues.length) setError({ message: 'Kiểm tra thay đổi danh sách trước khi tiếp tục.', details: diff.issues })
          else if (overSeats) setError({ message: seatsMessage })
          else { setError(null); setStep(2) }
        } else if (!confirmed) setError({ message: 'Xác nhận quyền cung cấp thông tin đăng ký trước khi gửi.' })
        else void send()
      }}>
        <fieldset className="rep-form-fieldset rep-stack" disabled={locked}>
          {step === 0 && <Panel title="Thông tin trường và đoàn"><div className="rep-fields">{fields.map(field => <label key={field.key} className="rep-field" htmlFor={`registration-${field.key}`}>
            <span>{field.label}<span aria-hidden="true"> *</span></span>
            <input id={`registration-${field.key}`} name={field.key} required type={field.type ?? 'text'} maxLength={field.max} className="rep-input" value={values[field.key]} aria-invalid={Boolean(fieldErrors[field.key])} aria-describedby={fieldErrors[field.key] ? `registration-${field.key}-error` : undefined} onChange={event => { setValues(previous => ({ ...previous, [field.key]: event.target.value })); setConfirmed(false) }} />
            {fieldErrors[field.key] && <span id={`registration-${field.key}-error`} className="rep-error-message">{fieldErrors[field.key]}</span>}
          </label>)}</div><p className="rep-hint">Email liên hệ của đoàn không thay thế email riêng của từng dòng lời mời.</p></Panel>}
          {step === 1 && <Panel title="Danh sách lời mời" action={base.registration && <button type="button" className={repButton('secondary', 'sm')} onClick={() => downloadBytes('CampusTour-danh-sach-hien-tai.xlsx', rosterWorkbookBytes(existingRows))}>Tải danh sách hiện tại</button>}>
            <div className="rep-stack"><ExcelUploader accepted={accepted} onAccept={next => { setAccepted(next); setConfirmed(false) }} existingRows={existingRows} canAddRows={newRosterRowsAllowed(base.tour)} inUse={base.registration ? { count: existingRows.length } : null} />
              {overSeats && <Callout tone="warn" title="Vượt số chỗ còn lại" role="status">{seatsMessage}</Callout>}
              {base.registration && !accepted && <RosterPreview rows={rows} variant="representative" />}
              {base.registration && <Link className={repButton('ghost', 'sm')} to={`/dai-dien/dang-ky/${base.registration.summary.id}?tab=email-change`}>Yêu cầu đổi email dòng đã chấp nhận</Link>}
            </div>
          </Panel>}
          {step === 2 && <div className="rep-stack"><Panel title="Thông tin đăng ký"><InfoList items={fields.map(field => ({ label: field.label, value: values[field.key] }))} /></Panel>
            <Panel title="Danh sách lời mời"><RosterPreview rows={rows} variant="representative" />
              {diff && accepted && <p className="rep-hint">Giữ nguyên {diff.unchanged.length} dòng, cập nhật {diff.changed.length}, thêm {diff.added.length}, loại {diff.removed.length}. Dòng bị loại sẽ mất lời mời và phiên truy cập hiện tại khi lưu.</p>}
            </Panel>
            <Callout title="Trạng thái từng lời mời được xử lý riêng">Hồ sơ và từng dòng lời mời được nhà trường xem xét riêng. Mỗi người nhận dùng lời mời cá nhân; không có mã dùng chung cho cả đoàn.</Callout>
            <Panel title="Mục đích sử dụng thông tin"><p className="rep-form-purpose">Thông tin trường, người liên hệ và danh sách lời mời chỉ dùng để tổ chức đăng ký, gửi lời mời và thống kê vận hành buổi tham quan. Không dùng để liên hệ tuyển sinh sau buổi.</p>
              <label className="rep-consent"><input type="checkbox" required checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />Tôi xác nhận có quyền cung cấp thông tin đăng ký và email lời mời trong danh sách này.</label>
            </Panel></div>}
        </fieldset>
        <div className="rep-form-foot"><button type="button" className={repButton('secondary')} disabled={locked || step === 0} onClick={() => { setError(null); setStep(previous => previous - 1) }}>Quay lại bước trước</button>
          <button type="submit" className={repButton('dark')} disabled={busy || Boolean(error?.stale) || reloading}>{busy && <Spinner />}{busy ? 'Đang gửi...' : step === 2 ? attempt ? 'Thử gửi lại' : base.registration ? resubmit ? 'Gửi lại đăng ký' : 'Lưu thay đổi' : 'Gửi đăng ký' : 'Tiếp tục'}</button>
        </div>
      </form>
    </div><aside className="rep-summary-aside" aria-label="Buổi tham quan đang đăng ký"><h2>{base.tour.name}</h2>
      <InfoList columns={1} items={[{ label: 'Thời gian dự kiến', value: formatDateTime(base.tour.scheduledStartAt) }, { label: 'Hạn tạo đăng ký và thêm dòng', value: formatDateTime(registrationClosesAt(base.tour).toISOString()) }, { label: 'Tuyến tham quan', value: base.tour.routeName }, { label: 'Điểm dừng trong tuyến', value: base.tour.stops.length }]} />
      <p className="rep-hint">Tối đa 10 điểm xem cho mỗi hồ sơ. Cập nhật và loại dòng hiện tại theo quyền do nhà trường cung cấp.</p>
    </aside></div>
  </RepPage>
}
