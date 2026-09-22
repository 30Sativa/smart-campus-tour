import { useId, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router'
import type { AdminRoute, TourInput } from '../../../api/contracts/admin'
import { panelClass, PanelHead } from '../../staff/StaffUi'
import { buttonClass } from '../../staff/ui-classes'
import { fromLocalInput, toLocalInput } from '../admin-format'
import { inputClass, labelClass } from '../admin-classes'
import { Notice } from '../AdminUi'
import { RoutePreview } from './RoutePreview'

type Errors = Partial<Record<keyof TourInput, string>>

/** The four fields scope §3.1 asks for; nothing else (no robot, no capacity, no language picker). */
function validate(values: { name: string; scheduledAt: string; description: string; routeId: string }): Errors {
  const errors: Errors = {}
  if (!values.name.trim()) errors.name = 'Nhập tên Tour.'
  if (!values.scheduledAt) errors.scheduledAt = 'Chọn ngày và giờ dự kiến.'
  else if (new Date(values.scheduledAt).getTime() <= Date.now()) errors.scheduledAt = 'Giờ dự kiến phải ở tương lai.'
  if (!values.description.trim()) errors.description = 'Nhập mô tả ngắn cho Tour.'
  if (!values.routeId) errors.routeId = 'Chọn một tuyến đã chuẩn bị.'
  return errors
}

/**
 * Create / edit a Tour. The form keeps what was typed on any error, marks
 * each field the server refused, and the submit is disabled while a request
 * is in flight, so a double click cannot create two Tours.
 */
export function TourForm({ initial, routes, submitLabel, busy, serverErrors = {}, serverMessage, onSubmit, cancelTo }: {
  initial?: Partial<TourInput>
  routes: AdminRoute[]
  submitLabel: string
  busy: boolean
  serverErrors?: Errors
  serverMessage?: string | null
  onSubmit: (input: TourInput) => void
  cancelTo: string
}) {
  const [values, setValues] = useState({
    name: initial?.name ?? '',
    scheduledAt: toLocalInput(initial?.scheduledAt),
    description: initial?.description ?? '',
    routeId: initial?.routeId ?? '',
  })
  const [clientErrors, setClientErrors] = useState<Errors>({})
  const [touchedSinceServer, setTouched] = useState<Set<keyof TourInput>>(new Set())
  const route = routes.find((item) => item.id === values.routeId) ?? null

  // A server error stays until that field is edited.
  const errorFor = (field: keyof TourInput) => clientErrors[field] ?? (touchedSinceServer.has(field) ? undefined : serverErrors[field])

  const set = (field: keyof TourInput) => (value: string) => {
    setValues((current) => ({ ...current, [field]: value }))
    setClientErrors((current) => ({ ...current, [field]: undefined }))
    setTouched((current) => new Set(current).add(field))
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    const errors = validate(values)
    setClientErrors(errors)
    if (Object.keys(errors).length) return
    setTouched(new Set())
    onSubmit({ name: values.name.trim(), scheduledAt: fromLocalInput(values.scheduledAt), description: values.description.trim(), routeId: values.routeId })
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <section className={panelClass} aria-label="Thông tin Tour">
        <PanelHead title="Thông tin Tour" description="Tên, giờ dự kiến, mô tả và tuyến. Tour mới luôn ở trạng thái Đang chuẩn bị." />
        <div className="space-y-4 p-5">
          {serverMessage && <Notice tone="danger">{serverMessage}</Notice>}
          <FormField label="Tên Tour" error={errorFor('name')}>
            {(id, describedBy) => <input id={id} aria-describedby={describedBy} aria-invalid={Boolean(errorFor('name'))} value={values.name} onChange={(event) => set('name')(event.target.value)} maxLength={120} placeholder="Ví dụ: Tham quan từ xa · Sáng thứ Bảy" className={inputClass} />}
          </FormField>
          <FormField label="Thời gian dự kiến" hint="Giờ theo múi giờ của trường. Tới giờ, robot không tự chạy; Staff bắt đầu thủ công." error={errorFor('scheduledAt')}>
            {(id, describedBy) => <input id={id} type="datetime-local" aria-describedby={describedBy} aria-invalid={Boolean(errorFor('scheduledAt'))} value={values.scheduledAt} onChange={(event) => set('scheduledAt')(event.target.value)} className={inputClass} />}
          </FormField>
          <FormField label="Mô tả" error={errorFor('description')}>
            {(id, describedBy) => <textarea id={id} aria-describedby={describedBy} aria-invalid={Boolean(errorFor('description'))} value={values.description} onChange={(event) => set('description')(event.target.value)} rows={4} maxLength={1000} placeholder="Nội dung ngắn đại diện trường sẽ thấy khi đăng ký." className={inputClass} />}
          </FormField>
          <FormField label="Tuyến" hint="Chỉ chọn tuyến nhóm kỹ thuật đã chuẩn bị. Tuyến chưa hoàn thiện không chọn được." error={errorFor('routeId')}>
            {(id, describedBy) => (
              <select id={id} aria-describedby={describedBy} aria-invalid={Boolean(errorFor('routeId'))} value={values.routeId} onChange={(event) => set('routeId')(event.target.value)} className={inputClass}>
                <option value="">Chọn tuyến</option>
                {routes.map((item) => (
                  <option key={item.id} value={item.id} disabled={!item.valid && item.id !== initial?.routeId}>
                    {item.name} · {item.stops.length} POI{item.valid ? '' : ' (chưa dùng được)'}
                  </option>
                ))}
              </select>
            )}
          </FormField>
          <div className="flex flex-col-reverse gap-2 border-t border-[#f1f5f9] pt-4 sm:flex-row sm:justify-end">
            <Link to={cancelTo} className={buttonClass('secondary')}>Hủy bỏ</Link>
            <button type="submit" disabled={busy} className={buttonClass('primary')}>{busy ? 'Đang lưu…' : submitLabel}</button>
          </div>
        </div>
      </section>

      <section className={panelClass} aria-label="Xem trước tuyến">
        <PanelHead title="Xem trước tuyến" description="Chỉ xem. Thứ tự POI, thời gian dừng, góc quay và thuyết minh do nhóm kỹ thuật cấu hình." />
        <div className="p-5">
          {route ? <RoutePreview route={route} /> : <p className="py-10 text-center text-sm text-[#94a3b8]">Chọn một tuyến để xem các điểm dừng.</p>}
        </div>
      </section>
    </form>
  )
}

function FormField({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: (id: string, describedBy: string | undefined) => ReactNode }) {
  const id = useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined
  return (
    <div>
      <label htmlFor={id} className={labelClass}>{label} <span className="text-[#b23e31]" aria-hidden="true">*</span></label>
      <div className="mt-1.5">{children(id, describedBy)}</div>
      {hint && <p id={hintId} className="mt-1 text-xs text-[#94a3b8]">{hint}</p>}
      {error && <p id={errorId} className="mt-1 text-xs font-bold text-[#b23e31]">{error}</p>}
    </div>
  )
}
