import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import type { RegistrationInput, RepresentativeRegistrationDetail, RepresentativeTour } from '../../api/contracts/representative'
import { buttonClass, inputClass, labelClass } from '../../features/staff/ui-classes'
import { Callout, ErrorState, InfoList, PageSkeleton, Panel, RepPage, RepPageHeader, Spinner } from '../../features/representative/components/RepUi'
import { ExcelUploader } from '../../features/representative/components/ExcelUploader'
import type { AcceptedRoster } from '../../features/representative/components/ExcelUploader'
import { RegistrationStepper } from '../../features/representative/components/RegistrationStepper'
import { RosterPreview } from '../../features/representative/components/RosterPreview'
import { useRepRegistration, useRepTour, useSubmitRegistration, useUpdateRegistration } from '../../features/representative/representative-hooks'
import { formatDate, formatTime, readRepError } from '../../features/representative/rep-format'
import type { RepError } from '../../features/representative/rep-format'
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
 * Three steps: group info, roster (template, upload, preview, confirm), final
 * check. Nothing is sent before the last step. A refusal reloads the data,
 * says why, and saves nothing partially.
 */
type Mode = 'new' | 'reregister' | 'edit' | 'resubmit' | 'replace'
type Field = 'schoolName' | 'groupName' | 'representativeName' | 'contactEmail'

const MODE_TEXT: Record<Mode, { title: string; submit: string; done: string }> = {
  new: { title: 'Đăng ký đoàn', submit: 'Gửi đăng ký', done: 'Đã gửi đăng ký. Đăng ký đang chờ Admin xét duyệt.' },
  reregister: { title: 'Đăng ký lại', submit: 'Gửi đăng ký', done: 'Đã đăng ký lại. Đăng ký đang chờ Admin xét duyệt.' },
  edit: { title: 'Chỉnh sửa đăng ký', submit: 'Lưu và gửi', done: 'Đã lưu thay đổi. Đăng ký vẫn chờ Admin xét duyệt.' },
  resubmit: { title: 'Chỉnh sửa và gửi lại', submit: 'Gửi lại để duyệt', done: 'Đã gửi lại. Đăng ký đang chờ Admin xét duyệt.' },
  replace: { title: 'Thay danh sách học sinh', submit: 'Gửi danh sách mới', done: 'Đã gửi danh sách mới. Admin cần duyệt lại đăng ký.' },
}

const STEPS = ['Thông tin đoàn', 'Danh sách học sinh', 'Xác nhận']
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function newRequestId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `req-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export default function RepRegisterPage() {
  const { tourId: tourParam, registrationId } = useParams()
  const registration = useRepRegistration(registrationId)
  const tourId = tourParam ?? registration.data?.tourId ?? ''
  const tour = useRepTour(tourId)

  if (registration.isLoading || tour.isLoading || (registrationId && !registration.data && !registration.isError)) return <PageSkeleton label="Đang tải trang đăng ký" />
  const loadError = registration.error ?? tour.error
  if (loadError || !tour.data) {
    return (
      <RepPage>
        <ErrorState title="Không mở được trang đăng ký" message={readRepError(loadError).message} back={{ to: '/dai-dien/buoi', label: 'Về danh sách buổi' }} />
      </RepPage>
    )
  }
  return <RegisterForm key={`${tour.data.id}:${registration.data?.id ?? 'new'}`} tour={tour.data} registration={registration.data ?? null} />
}

function modeOf(tour: RepresentativeTour, reg: RepresentativeRegistrationDetail | null): Mode | null {
  if (!reg) return tour.register.allowed ? (tour.myRegistrationState === 'Cancelled' ? 'reregister' : 'new') : null
  if (reg.state === 'Submitted') return reg.allowedActions.edit.allowed ? 'edit' : null
  if (reg.state === 'Rejected') return reg.allowedActions.edit.allowed ? 'resubmit' : null
  if (reg.state === 'Approved') return reg.allowedActions.replaceRoster.allowed ? 'replace' : null
  return null
}

function validate(v: Record<Field, string>): Partial<Record<Field, string>> {
  const errs: Partial<Record<Field, string>> = {}
  if (!v.schoolName.trim()) errs.schoolName = 'Nhập tên trường hoặc đơn vị.'
  else if (v.schoolName.trim().length > 120) errs.schoolName = 'Tối đa 120 ký tự.'
  if (v.groupName.trim().length > 60) errs.groupName = 'Tối đa 60 ký tự.'
  if (!v.representativeName.trim()) errs.representativeName = 'Nhập họ tên người đại diện.'
  else if (v.representativeName.trim().length > 80) errs.representativeName = 'Tối đa 80 ký tự.'
  if (!v.contactEmail.trim()) errs.contactEmail = 'Nhập email liên hệ.'
  else if (!EMAIL.test(v.contactEmail.trim())) errs.contactEmail = 'Email chưa đúng định dạng, ví dụ ten@truong.edu.vn.'
  return errs
}

function TextField({ id, label, value, onChange, onBlur, error, hint, required, disabled, type = 'text', autoComplete, placeholder }: {
  id: Field; label: string; value: string; onChange: (v: string) => void; onBlur: () => void; error?: string; hint?: string; required?: boolean; disabled?: boolean; type?: string; autoComplete?: string; placeholder?: string
}) {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined
  return (
    <div className="grid gap-2">
      <label htmlFor={id} className={`${labelClass} text-sm`}>
        {label}{required ? <span className="text-[#b23e31]"> *</span> : <span className="font-normal text-[#94a3b8]"> (không bắt buộc)</span>}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        disabled={disabled}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy}
        autoComplete={autoComplete}
        placeholder={placeholder}
        className={`${inputClass} min-h-11 text-[15px]`}
      />
      {error ? <p id={`${id}-error`} className="text-[13px] font-medium text-[#b23e31]">{error}</p> : hint ? <p id={`${id}-hint`} className="text-[13px] text-[#64748b]">{hint}</p> : null}
    </div>
  )
}

function Summary({ title, onEdit, children }: { title: string; onEdit?: () => void; children: ReactNode }) {
  return (
    <div className="border-t border-[#eef1f5] pt-5 first:border-0 first:pt-0">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-[15px] font-semibold text-[#0f172a]">{title}</h3>
        {onEdit && <button type="button" onClick={onEdit} className={buttonClass('ghost', 'sm')}>Sửa</button>}
      </div>
      {children}
    </div>
  )
}

function RegisterForm({ tour, registration }: { tour: RepresentativeTour; registration: RepresentativeRegistrationDetail | null }) {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const submit = useSubmitRegistration()
  const update = useUpdateRegistration()
  const profile = useMemo(() => currentRepresentativeProfile(), [])
  const mode = modeOf(tour, registration)
  const infoLocked = mode === 'replace'

  const [step, setStep] = useState(() => (infoLocked || params.get('buoc') === '2' ? 1 : 0))
  const [values, setValues] = useState<Record<Field, string>>({
    schoolName: registration?.schoolName ?? profile.schoolName,
    groupName: registration?.groupName ?? '',
    representativeName: registration?.representativeName ?? profile.representativeName,
    contactEmail: registration?.contactEmail ?? profile.contactEmail,
  })
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({})
  const [accepted, setAccepted] = useState<AcceptedRoster | null>(null)
  const [rosterError, setRosterError] = useState<string | undefined>()
  const [showRoster, setShowRoster] = useState(false)
  const [error, setError] = useState<RepError | null>(null)
  const [requestId] = useState(newRequestId)

  useEffect(() => {
    window.scrollTo?.({ top: 0, behavior: 'smooth' })
  }, [step])

  const back = registration ? { to: `/dai-dien/dang-ky/${registration.id}`, label: 'Đăng ký của tôi' } : { to: `/dai-dien/buoi/${tour.id}`, label: tour.name }

  if (!mode) {
    const why = registration
      ? registration.allowedActions.edit.reason ?? registration.allowedActions.replaceRoster.reason ?? registration.allowedActions.reRegister.reason
      : tour.register.reason
    return (
      <RepPage narrow>
        <RepPageHeader back={back} title="Không thể chỉnh sửa đăng ký" />
        <Callout
          tone="muted"
          title={registration?.state === 'Cancelled' ? 'Đăng ký này đã hủy' : 'Đăng ký đang ở chế độ chỉ xem'}
          actions={
            registration?.state === 'Cancelled' && registration.allowedActions.reRegister.allowed
              ? <Link to={`/dai-dien/buoi/${tour.id}/dang-ky`} className={buttonClass('primary', 'sm')}>Đăng ký lại</Link>
              : <Link to={registration || tour.myRegistrationId ? `/dai-dien/dang-ky/${registration?.id ?? tour.myRegistrationId}` : `/dai-dien/buoi/${tour.id}`} className={buttonClass('secondary', 'sm')}>{registration || tour.myRegistrationId ? 'Xem đăng ký' : 'Về trang buổi'}</Link>
          }
        >
          {registration?.state === 'Cancelled' && registration.allowedActions.reRegister.allowed ? 'Đăng ký lại sẽ dùng chính bản ghi này và gửi cho Admin duyệt.' : why ?? 'Buổi không còn nhận thay đổi.'}
        </Callout>
      </RepPage>
    )
  }

  const text = MODE_TEXT[mode]
  const errors = { ...validate(values), ...(error?.fieldErrors ?? {}) } as Partial<Record<Field, string>>
  const shown = (f: Field) => (touched[f] ? errors[f] : error?.fieldErrors?.[f])
  const set = (f: Field) => (v: string) => {
    setValues((cur) => ({ ...cur, [f]: v }))
    if (error?.fieldErrors?.[f]) setError(null)
  }
  const blur = (f: Field) => () => setTouched((cur) => ({ ...cur, [f]: true }))

  const keepsCurrent = (mode === 'edit' || mode === 'resubmit') && !accepted && registration
  const roster = accepted?.rows ?? (keepsCurrent ? registration.roster : [])
  const busy = submit.isPending || update.isPending

  const next = () => {
    setError(null)
    if (step === 0) {
      setTouched({ schoolName: true, groupName: true, representativeName: true, contactEmail: true })
      if (Object.keys(validate(values)).length) return
    }
    if (step === 1 && roster.length === 0) {
      setRosterError(mode === 'replace' ? 'Tải lên và xác nhận danh sách mới để tiếp tục.' : 'Tải lên file Excel và bấm "Xác nhận sử dụng danh sách này" để tiếp tục.')
      return
    }
    setStep((s) => Math.min(s + 1, 2))
  }

  const send = () => {
    setError(null)
    const input: RegistrationInput = {
      schoolName: values.schoolName.trim(),
      groupName: values.groupName.trim(),
      representativeName: values.representativeName.trim(),
      contactEmail: values.contactEmail.trim(),
      roster,
    }
    const onError = (e: unknown) => {
      const err = readRepError(e)
      setError(err)
      const f = err.fieldErrors
      if (f.schoolName || f.groupName || f.representativeName || f.contactEmail) setStep(infoLocked ? 1 : 0)
      else if (f.roster) setStep(1)
    }
    const onSuccess = (saved: { id: string }) => navigate(`/dai-dien/dang-ky/${saved.id}`, { state: { flash: text.done } })
    if (mode === 'new' || mode === 'reregister') submit.mutate({ tourId: tour.id, input, requestId }, { onSuccess, onError })
    else if (registration) update.mutate({ id: registration.id, input, version: registration.version }, { onSuccess, onError })
  }

  const locked = error?.code === 'StaleData' || error?.code === 'NotAllowed'

  return (
    <RepPage>
      <RepPageHeader back={back} title={text.title} description={`${tour.name}, ${formatTime(tour.scheduledAt)} ${formatDate(tour.scheduledAt)}`} />

      <div className="mb-7 rounded-2xl border border-[#e5e9f0] bg-white px-3 py-5 sm:px-8">
        <RegistrationStepper steps={STEPS} current={step} onSelect={(i) => { if (!(infoLocked && i === 0)) setStep(i) }} />
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-5">
          {error && (
            <Callout
              tone={locked ? 'warn' : 'danger'}
              role="alert"
              title={error.code === 'StaleData' ? 'Dữ liệu đã thay đổi' : error.code === 'NotAllowed' ? 'Không lưu được đăng ký' : 'Chưa gửi được đăng ký'}
              actions={error.code === 'NotAllowed' ? <Link to={registration ? `/dai-dien/dang-ky/${registration.id}` : `/dai-dien/buoi/${tour.id}`} className={buttonClass('secondary', 'sm')}>Xem trạng thái hiện tại</Link> : undefined}
            >
              {error.message}{locked ? ' Trang đã tải lại dữ liệu mới nhất; không có thay đổi nào được lưu.' : ''}
            </Callout>
          )}

          {mode === 'replace' && step < 2 && (
            <Callout tone="warn" title="Đăng ký sẽ quay về Chờ duyệt">
              Khi gửi danh sách mới, Admin phải duyệt lại. Học sinh đã ở phòng chờ sẽ thấy "Danh sách đang được cập nhật" cho tới khi có kết quả.
            </Callout>
          )}
          {mode === 'resubmit' && registration?.rejectionReason && step < 2 && (
            <Callout tone="danger" title="Lý do từ chối">{registration.rejectionReason}</Callout>
          )}

          {step === 0 && (
            <Panel title="Thông tin đoàn">
              <div className="grid gap-5">
                <div className="grid gap-5 md:grid-cols-2">
                  <TextField id="schoolName" label="Tên trường / đơn vị" required value={values.schoolName} onChange={set('schoolName')} onBlur={blur('schoolName')} error={shown('schoolName')} disabled={infoLocked} autoComplete="organization" placeholder="Ví dụ: THPT Trần Phú" />
                  <TextField id="groupName" label="Tên đoàn / lớp" value={values.groupName} onChange={set('groupName')} onBlur={blur('groupName')} error={shown('groupName')} disabled={infoLocked} placeholder="Ví dụ: Lớp 10A5" hint="Giúp Admin phân biệt các đoàn cùng trường." />
                </div>
                <div className="grid gap-5 md:grid-cols-2">
                  <TextField id="representativeName" label="Người đại diện / liên hệ" required value={values.representativeName} onChange={set('representativeName')} onBlur={blur('representativeName')} error={shown('representativeName')} disabled={infoLocked} autoComplete="name" />
                  <TextField id="contactEmail" label="Email liên hệ" required type="email" value={values.contactEmail} onChange={set('contactEmail')} onBlur={blur('contactEmail')} error={shown('contactEmail')} disabled={infoLocked} autoComplete="email" hint="Admin gửi đường dẫn và mã đoàn tới địa chỉ này sau khi duyệt." />
                </div>
                <p className="text-[13px] leading-relaxed text-[#64748b]">Chỉ cần thông tin của người đại diện. Không nhập số điện thoại, CCCD hay email của học sinh.</p>
              </div>
            </Panel>
          )}

          {step === 1 && (
            <Panel title="Danh sách học sinh">
              {keepsCurrent && (
                <div className="mb-5"><Callout tone="info" title={`Đang dùng danh sách hiện tại (${registration.roster.length} học sinh)`}>Không cần tải file nếu danh sách không đổi. Tải file mới sẽ thay toàn bộ danh sách hiện tại sau khi bạn xác nhận.</Callout></div>
              )}
              <ExcelUploader
                accepted={accepted}
                inUse={registration && !accepted ? { count: registration.roster.length } : null}
                error={rosterError ?? error?.fieldErrors?.roster}
                onAccept={(r) => {
                  setAccepted(r)
                  setRosterError(undefined)
                  if (error?.fieldErrors?.roster) setError(null)
                }}
              />
            </Panel>
          )}

          {step === 2 && (
            <Panel title="Kiểm tra trước khi gửi">
              <div className="space-y-5">
                <Summary title="Buổi tham quan">
                  <InfoList items={[
                    { label: 'Tên buổi', value: tour.name },
                    { label: 'Tuyến', value: `${tour.routeName}, ${tour.stops.length} điểm` },
                    { label: 'Ngày', value: formatDate(tour.scheduledAt) },
                    { label: 'Giờ bắt đầu', value: formatTime(tour.scheduledAt) },
                  ]} />
                </Summary>
                <Summary title="Thông tin đoàn" onEdit={infoLocked ? undefined : () => setStep(0)}>
                  <InfoList items={[
                    { label: 'Trường / đơn vị', value: values.schoolName },
                    { label: 'Đoàn / lớp', value: values.groupName.trim() || <span className="font-normal text-[#94a3b8]">Không có</span> },
                    { label: 'Người đại diện', value: values.representativeName },
                    { label: 'Email liên hệ', value: values.contactEmail },
                  ]} />
                </Summary>
                <Summary title="Danh sách học sinh" onEdit={() => setStep(1)}>
                  <InfoList items={[
                    { label: 'Nguồn', value: accepted ? <span className="break-all">{accepted.fileName}</span> : 'Giữ danh sách hiện tại' },
                    { label: 'Số học sinh', value: `${roster.length} học sinh, ${roster.filter((r) => r.className).length} dòng có lớp` },
                  ]} />
                  <button type="button" onClick={() => setShowRoster((v) => !v)} aria-expanded={showRoster} className={`${buttonClass('secondary', 'sm')} mt-4`}>{showRoster ? 'Ẩn danh sách' : 'Xem danh sách'}</button>
                  {showRoster && <div className="mt-4"><RosterPreview rows={roster} /></div>}
                </Summary>
                <p className="rounded-xl bg-[#f5f9ff] px-4 py-3 text-sm leading-relaxed text-[#35507a]">
                  Sau khi gửi, đăng ký chuyển sang <b>Chờ duyệt</b>.{accepted && registration ? ' Danh sách mới thay toàn bộ danh sách cũ.' : ''} Bạn vẫn sửa hoặc hủy được khi buổi còn đang nhận đăng ký.
                </p>
              </div>
            </Panel>
          )}

          <div className="sticky bottom-0 z-10 -mx-4 flex items-center justify-between gap-3 border-t border-[#e5e9f0] bg-white/95 px-4 py-3 backdrop-blur-md sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
            {step > (infoLocked ? 1 : 0) ? (
              <button type="button" className={buttonClass('secondary', 'lg')} onClick={() => setStep(step === 2 ? (infoLocked ? 1 : 0) : step - 1)} disabled={busy}>
                <ArrowLeft size={17} aria-hidden="true" />{step === 2 ? 'Quay lại chỉnh sửa' : 'Quay lại'}
              </button>
            ) : <Link to={back.to} className={buttonClass('ghost', 'lg')}>Hủy bỏ</Link>}
            {step < 2 ? (
              <button type="button" className={buttonClass('primary', 'lg')} onClick={next}>Tiếp tục<ArrowRight size={17} aria-hidden="true" /></button>
            ) : (
              <button type="button" className={buttonClass('primary', 'lg')} onClick={send} disabled={busy}>{busy && <Spinner />}{busy ? 'Đang gửi...' : text.submit}</button>
            )}
          </div>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24">
          <Panel title="Buổi đã chọn">
            <p className="font-semibold text-[#0f172a]">{tour.name}</p>
            <p className="mt-1 text-sm text-[#475569]">{formatTime(tour.scheduledAt)}, {formatDate(tour.scheduledAt)}</p>
            <p className="mt-0.5 text-sm text-[#64748b]">{tour.routeName}, {tour.stops.length} điểm</p>
          </Panel>
          <Panel title="Quy tắc danh sách">
            <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-[#475569] marker:text-[#94a3b8]">
              <li>Chỉ ghi họ tên và lớp của học sinh.</li>
              <li>Dòng trống hoàn toàn được bỏ qua; tên trùng vẫn giữ nguyên.</li>
              <li>Một dòng lỗi thì cả file không được nhập, danh sách cũ giữ nguyên.</li>
              <li>Học sinh phải nhập lớp khi vào phiên nếu dòng của em có lớp.</li>
            </ul>
          </Panel>
        </aside>
      </div>
    </RepPage>
  )
}
