import { useState, type FormEvent } from 'react'
import { ArrowRight, CalendarDays, Check, Zap, type LucideIcon } from 'lucide-react'
import { Link, useSearchParams } from 'react-router'
import { panelClass } from '../../../components/ui/ConsolePrimitives'
import { buttonClass, inputClass } from '../../../components/ui/ui-classes'
import { DateInput } from '../../../components/ui/DateInput'
import { formatDate, formatDateTime, formatDuration, formatTime } from '../../../components/ui/date-time'
import { useAuthStore } from '../../../stores/auth-store'
import { Notice } from '../AdminUi'
import { passedAt, scheduleFitLabel } from '../routes/route-messages'
import { useMapVersions } from '../../technical/technical-hooks'
import { useTestedRoutes, useTourOperators, useTourRobots, useTourShifts, useTourSlots } from './hooks'
import { campusDay } from './tour-calendar'
import { tourError } from './tour-messages'
import type { VersionedRoute } from '../routes/versioned-api'
import { QUICK_TOUR_RULES, tourKindOf, type TourKind } from './quick-tour'
import type { CreateTourInput, TourSlot } from './types'

const DATE_PARAM = /^\d{4}-\d{2}-\d{2}$/
/** When a shift's Tour must have ended: its start plus the most the shift holds. */
const tourEnd = (slot: TourSlot) => new Date(new Date(slot.startsAt).getTime() + slot.maxDurationSeconds * 1000).toISOString()
/** "Ca sáng · 08:15-09:45 · Giữ robot 08:00-10:00" */
const shiftLabel = (slot: TourSlot) =>
  `${slot.shiftName} · ${slot.time}-${formatTime(tourEnd(slot))} · Giữ robot ${formatTime(slot.reservationStartsAt)}-${formatTime(slot.reservationEndsAt)}`

const RERUN_REASON = 'Cần chạy thử lại'
/** Why this route cannot be chosen (docs/lich-tour-theo-ca.md §4); null when it can. UNKNOWN is a PASS measured the old way, which cannot size a shift. */
const routeBlockReason = (route: VersionedRoute) =>
  route.scheduleFit === 'TOO_LONG_FOR_SHIFT' ? scheduleFitLabel(route)!.text : route.scheduleFit === 'UNKNOWN' ? RERUN_REASON : null

type CreateTourFormProps = {
  busy: boolean; error: string | null
  onSubmit: (input: CreateTourInput) => void
}

/**
 * A new Tour names one tested route revision, one physical robot and one Operator. A Tour on a shift also names one free
 * shift (ADR-0034, docs/lich-tour-theo-ca.md §3): `?date=YYYY-MM-DD&shift=S1` picks the day and shift in advance. A quick
 * Tour (ADR-0053) names none: it holds the robot from now and may start once ready. `?route=<revisionId>` picks the route.
 */
export function CreateTourForm({ busy, error, onSubmit }: CreateTourFormProps) {
  const [params, setParams] = useSearchParams()
  // The kind is asked before the form, because it decides the deadlines and whether there is a shift at all.
  const kind = tourKindOf(params.get('kind'))
  const quick = kind === 'quick'
  const chooseKind = (next: TourKind | null) => setParams(prev => { const copy = new URLSearchParams(prev); if (next) copy.set('kind', next); else copy.delete('kind'); return copy })
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  // Null until Staff picks: until then the route comes from `?route=`, once the list says it can be chosen.
  const [pickedRouteId, setPickedRouteId] = useState<string | null>(null)
  const [robotCode, setRobotCode] = useState('')
  // Null until Staff picks: until then the signed-in user, when the list offers them as an Operator.
  const [pickedOperatorId, setPickedOperatorId] = useState<string | null>(null)
  const signedIn = useAuthStore(state => state.user?.userId)
  const [date, setDate] = useState(() => DATE_PARAM.test(params.get('date') ?? '') ? params.get('date')! : '')
  const [shiftCode, setShiftCode] = useState(() => params.get('shift') ?? '')
  const [video, setVideo] = useState('')
  const [capacity, setCapacity] = useState('20')
  const [quickReason, setQuickReason] = useState('')
  const [clientError, setClientError] = useState('')
  const routes = useTestedRoutes()
  const linkedRouteId = params.get('route')
  const linkedRoute = linkedRouteId ? routes.data?.find(route => route.revisionId === linkedRouteId) : undefined
  const linkedUsable = linkedRoute != null && routeBlockReason(linkedRoute) === null
  const routeRevisionId = pickedRouteId ?? (linkedUsable ? linkedRoute.revisionId : '')
  const noRouteUsable = Boolean(routes.data?.length) && routes.data!.every(route => routeBlockReason(route) !== null)
  const robots = useTourRobots(routeRevisionId)
  const operators = useTourOperators()
  const operatorUserId = pickedOperatorId ?? (signedIn && operators.data?.some(person => person.userId === signedIn) ? signedIn : '')
  const slots = useTourSlots(routeRevisionId, robotCode, date, !quick)
  const today = campusDay(new Date())
  // Only for the wait shown to Staff; the server sets the quick Tour's latest Start when it creates it.
  const waitMinutes = useTourShifts(today, today, quick).data?.quickTourWaitMinutes
  const maps = useMapVersions()
  const selected = routes.data?.find(route => route.revisionId === routeRevisionId)
  const selectedArea = maps.data?.find(item => item.map.id === selected?.mapVersionId)?.map.areaName
  const selectedPassedAt = selected && passedAt(selected)
  const day = slots.data?.days[0]
  // Derived, so a shift that stops being free after a refresh drops out of the review by itself.
  const picked = day?.slots.find(item => item.shiftCode === shiftCode)
  const usable = picked?.available ? picked : undefined
  const ready = Boolean(selected && robotCode && operatorUserId && (quick ? quickReason.trim() : usable))
  const expected = slots.data?.expectedDurationSeconds
  const overRecommended = expected != null && slots.data != null && expected > slots.data.recommendedMaxSeconds

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (busy || !ready) return
    if (!name.trim()) return setClientError('Nhập tên Tour.')
    setClientError('')
    const common = { name: name.trim(), description: description.trim() || null, routeRevisionId, robotCode, operatorUserId, fallbackVideoUrl: video.trim() || null, capacity: Number(capacity) }
    if (quick) onSubmit({ ...common, scheduledStartAt: null, shortNoticeReason: quickReason.trim() })
    else if (usable) onSubmit({ ...common, scheduledStartAt: usable.startsAt })
  }

  if (!kind) return <TourKindChooser onPick={chooseKind} />

  return <form onSubmit={submit} className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
    <fieldset disabled={busy} className={`${panelClass} space-y-4 p-4`}>
      <legend className="sr-only">Thông tin Tour</legend>
      {(clientError || error) && <Notice tone="danger">{clientError || error}</Notice>}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-[#f1f5f9] pb-3 text-[13px]">
        <KindPill short={quick} />
        <span className="text-muted">{quick ? QUICK_TOUR_RULES.summary : 'Trước giờ bắt đầu ít nhất 72 giờ'}</span>
        <button type="button" className="ml-auto rounded-lg px-2 py-1 font-semibold text-[#2563eb] hover:bg-[#eff6ff] hover:text-[#1d4ed8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb]" onClick={() => chooseKind(null)}>Đổi loại</button>
      </div>
      <label className="block text-sm">Tên Tour<input required maxLength={150} className={inputClass} value={name} onChange={e => setName(e.target.value)} placeholder="Ví dụ: Tham quan từ xa · Sáng thứ Bảy" /></label>
      {quick && <label className="block text-sm">Lý do tạo gấp<textarea required maxLength={500} rows={2} className={inputClass} value={quickReason} onChange={e => setQuickReason(e.target.value)} placeholder="Ví dụ: Buổi trình diễn với đoàn khách của nhà trường." /></label>}
      <label className="block text-sm">Mô tả<textarea maxLength={1000} rows={3} className={inputClass} value={description} onChange={e => setDescription(e.target.value)} placeholder="Nội dung ngắn đại diện trường sẽ thấy khi đăng ký." /></label>
      <label className="block text-sm">Tuyến đã kiểm chứng<select title="" required aria-label="Tuyến đã kiểm chứng" className={inputClass} value={routeRevisionId} disabled={routes.isPending} onChange={e => { setPickedRouteId(e.target.value); setRobotCode('') }}>
        <option value="">Chọn tuyến</option>
        {/* docs/lich-tour-theo-ca.md §4: a route no shift can hold is shown but cannot be chosen. */}
        {routes.data?.map(route => {
          const blocked = routeBlockReason(route)
          return <option key={route.revisionId} value={route.revisionId} disabled={blocked !== null}>{route.name} · {route.stops.length} điểm dừng{blocked ? ` (${blocked})` : ''}</option>
        })}
      </select>
        {routes.isError ? <span role="alert" className="mt-1 block text-xs text-[#b23e31]">Không tải được danh mục tuyến.</span>
          : linkedRouteId && routes.data && !linkedUsable && pickedRouteId === null ? <span role="status" className="mt-1 block text-xs text-[#b23e31]">Tuyến vừa mở chưa dùng được để tạo Tour. Chọn tuyến khác.</span>
          : routes.data?.length === 0 ? <span role="status" className="mt-1 block text-xs text-[#b23e31]">Chưa có tuyến nào chạy thử đạt. Gửi kiểm chứng ở Danh mục tuyến và chờ Kỹ thuật ghi kết quả.</span>
          : <span className="mt-1 block text-xs text-[#64748b]">Chỉ hiện tuyến đã gửi kiểm chứng và có kết quả chạy thử đạt. Tuyến quá dài cho 1 ca hoặc cần chạy thử lại thì chưa chọn được.</span>}</label>
      {noRouteUsable && <Notice tone="warn">
        <p className="font-semibold">Chưa có tuyến nào dùng được để tạo Tour.</p>
        <ul className="mt-1 list-disc pl-5" aria-label="Lý do từng tuyến">{routes.data!.map(route => {
          const reason = routeBlockReason(route)
          return <li key={route.revisionId}>{route.name}: {reason}.{reason === RERUN_REASON && ' Nhờ Kỹ thuật ghi một lần chạy mới.'}</li>
        })}</ul>
      </Notice>}
      <label className="block text-sm">Robot<select title="" required aria-label="Robot" className={inputClass} value={robotCode} disabled={!routeRevisionId || robots.isPending} onChange={e => setRobotCode(e.target.value)}>
        <option value="">Chọn robot vật lý</option>
        {robots.data?.map(robot => <option key={robot.robotCode} value={robot.robotCode} disabled={!robot.usable}>{robot.displayName ? `${robot.displayName} · ` : ''}{robot.robotCode}{robot.blockReason ? ` (${robot.blockReason})` : ''}</option>)}
      </select>
        {robots.isError ? <span role="alert" className="mt-1 block text-xs text-[#b23e31]">Không tải được danh sách robot.</span>
          : !routeRevisionId ? <span className="mt-1 block text-xs text-[#64748b]">Chọn tuyến trước để biết robot nào chạy được.</span>
          : robots.data && !robots.data.some(robot => robot.usable) && <span role="status" className="mt-1 block text-xs text-[#b23e31]">Chưa có robot nào sẵn sàng cho tuyến này.</span>}</label>
      <label className="block text-sm">Người vận hành<select title="" required aria-label="Người vận hành" className={inputClass} value={operatorUserId} disabled={operators.isPending} onChange={e => setPickedOperatorId(e.target.value)}>
        <option value="">Chọn Staff</option>
        {operators.data?.map(person => <option key={person.userId} value={person.userId}>{person.fullName} · {person.username}</option>)}
      </select>
        {operators.isError && <span role="alert" className="mt-1 block text-xs text-[#b23e31]">Không tải được danh sách Staff.</span>}</label>
      {quick ? null : <>
      <label className="block text-sm">Ngày tổ chức<DateInput required min={campusDay(new Date())} value={date} onChange={setDate} />
        <span className="mt-1 block text-xs text-muted">Giờ Việt Nam. Tới giờ robot không tự chạy; Staff bắt đầu thủ công.</span></label>
      <div role="group" aria-label="Ca">
        <p className="text-sm">Ca</p>
        {!routeRevisionId || !robotCode ? <p className="mt-1 text-xs text-[#64748b]">Chọn tuyến và robot để xem ca nào còn trống.</p>
          : !date ? <p className="mt-1 text-xs text-[#64748b]">Chọn ngày để xem các ca.</p>
          : slots.isPending ? <p aria-busy="true" className="mt-1 text-xs text-[#64748b]">Đang tải các ca…</p>
          : slots.isError ? <p role="alert" className="mt-1 text-xs text-[#b23e31]">{tourError(slots.error)}</p>
          : <div className="mt-1.5 grid gap-2">
            {day?.slots.map(item => <ShiftButton key={item.shiftCode} slot={item} chosen={item.shiftCode === shiftCode} onPick={() => setShiftCode(item.shiftCode)} />)}
            {picked && !picked.available && <p role="alert" className="text-xs text-[#b23e31]">{picked.shiftName} không dùng được: {picked.reason}. Chọn ca khác.</p>}
          </div>}
      </div></>}
      <label className="block text-sm">Sức chứa<input required type="number" min={1} max={slots.data?.maxCapacity ?? 20} step={1} className={inputClass} value={capacity} onChange={e => setCapacity(e.target.value)} />
        <span className="mt-1 block text-xs text-[#64748b]">Số dòng đăng ký tối đa của cả Tour. Mỗi điểm xem chung tính là 1 chỗ.</span></label>
      <label className="block text-sm">Video dự phòng (không bắt buộc)<input type="url" maxLength={1000} className={inputClass} value={video} onChange={e => setVideo(e.target.value)} placeholder="https://…" /></label>
      <div className="flex flex-col-reverse gap-2 border-t border-[#f1f5f9] pt-4 sm:flex-row sm:justify-end">
        <Link to="/staff/schedule" className={buttonClass('secondary')}>Hủy bỏ</Link>
        <button type="submit" disabled={busy || !ready} className={buttonClass('primary')}>{busy ? 'Đang lưu…' : 'Tạo Tour'}</button>
      </div>
    </fieldset>

    <div className="space-y-3">
      {quick && <section className={`${panelClass} p-4`} aria-label="Tour nhanh chạy thế nào">
        <h2 className="text-[15px] font-semibold">Tour nhanh chạy thế nào</h2>
        <dl className="mt-3 space-y-2 text-sm">
          <Review label="Giữ robot">{QUICK_TOUR_RULES.hold.value}<span className="block text-xs text-muted">{QUICK_TOUR_RULES.hold.note}</span></Review>
          <Review label="Bắt đầu">{QUICK_TOUR_RULES.start.value}<span className="block text-xs text-muted">{QUICK_TOUR_RULES.start.note}</span></Review>
          <Review label="Hạn bắt đầu">{QUICK_TOUR_RULES.deadline(waitMinutes).value}<span className="block text-xs text-muted">{QUICK_TOUR_RULES.deadline(waitMinutes).note}</span></Review>
          <Review label="Đóng đăng ký">{QUICK_TOUR_RULES.registration}</Review>
          <Review label="Sức chứa">{capacity} chỗ</Review>
        </dl>
      </section>}
      {!quick && usable && slots.data && <section className={`${panelClass} p-4`} aria-label="Xem lại trước khi tạo">
        <h2 className="text-[15px] font-semibold">Xem lại trước khi tạo</h2>
        <dl className="mt-3 space-y-2 text-sm">
          <Review label="Ca">{usable.shiftName}</Review>
          <Review label="Bắt đầu">{formatDateTime(usable.startsAt)}</Review>
          <Review label="Thời lượng dự kiến">{formatDuration(expected!)}
            {expected !== slots.data.measuredDurationSeconds && <span className="block text-xs text-muted">Chạy thử đo {formatDuration(slots.data.measuredDurationSeconds)}, cộng thêm thời gian dừng đã tăng.</span>}
            <span className="block text-xs text-muted">Ca này chứa tối đa {formatDuration(usable.maxDurationSeconds)}.</span></Review>
          <Review label="Giữ robot">{formatTime(usable.reservationStartsAt)} - {formatTime(usable.reservationEndsAt)}</Review>
          <Review label="Đóng đăng ký">{formatDateTime(usable.registrationClosesAt)}</Review>
          <Review label="Sức chứa">{capacity} chỗ</Review>
        </dl>
        {overRecommended && <div className="mt-3"><Notice tone="warn">Tuyến dài {formatDuration(expected!)}, hơn mức khuyến nghị {formatDuration(slots.data.recommendedMaxSeconds)}. Vẫn tạo được, nhưng nên cân nhắc tuyến ngắn hơn.</Notice></div>}
      </section>}
      <section className={`${panelClass} p-4`} aria-label="Xem trước tuyến">
        <h2 className="text-[15px] font-semibold">Xem trước tuyến</h2>
        {!selected ? <p className="py-10 text-center text-sm text-muted">Chọn một tuyến để xem các điểm dừng.</p>
          : <div className="mt-3 space-y-3">
            <p className="text-sm text-muted">{selectedArea && `${selectedArea} · `}đã chạy thử đạt{selectedPassedAt && ` ngày ${formatDate(selectedPassedAt)}`}</p>
            <ol className="divide-y divide-[#e2e8f0]">{selected.stops.map(stop => <li key={stop.poiRevisionId} className="py-2.5 text-sm">
              <span className="font-medium">{stop.stopOrder}. {stop.name}</span>
              <span className="block text-xs text-muted">Dừng {formatDuration(stop.dwellSeconds)}</span>
            </li>)}</ol>
          </div>}
      </section>
    </div>
  </form>
}

type KindOption = { value: TourKind; icon: LucideIcon; title: string; summary: string; facts: string[] }
const kinds = (waitMinutes: number | null | undefined): KindOption[] => [
  { value: 'normal', icon: CalendarDays, title: 'Tour theo ca', summary: 'Lên lịch trước, trường có thời gian đăng ký và Staff duyệt.',
    facts: ['Tạo trước giờ bắt đầu ít nhất 72 giờ', 'Đăng ký đóng trước 48 giờ', 'Staff duyệt đơn trước 24 giờ'] },
  { value: 'quick', icon: Zap, title: 'Tour nhanh', summary: 'Chạy ngay cho buổi trình diễn hoặc đoàn khách đột xuất.',
    facts: QUICK_TOUR_RULES.facts(waitMinutes) },
]

function KindPill({ short }: { short: boolean }) {
  const Icon = short ? Zap : CalendarDays
  return <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${short ? 'border-[#f1dcb0] bg-[#fffaf0] text-[#7d5310]' : 'border-[#dbe6f4] bg-[#eff6ff] text-[#1d4ed8]'}`}>
    <Icon size={13} aria-hidden="true" />{short ? 'Tour nhanh' : 'Tour theo ca'}</span>
}

/** The first step of "Tạo Tour": which kind, before any field is shown. */
function TourKindChooser({ onPick }: { onPick: (kind: TourKind) => void }) {
  const today = campusDay(new Date())
  const shifts = useTourShifts(today, today)
  const waitMinutes = shifts.data?.quickTourWaitMinutes
  return <section className={`${panelClass} max-w-3xl p-5`} aria-labelledby="tour-kind-title">
    <p className="text-xs font-semibold text-[#2563eb]">Bước 1/2</p>
    <h2 id="tour-kind-title" className="mt-0.5 text-[17px] font-semibold text-[#0f172a]">Chọn loại Tour</h2>
    <p className="mt-1 text-[13px] text-[#64748b]">Loại Tour quyết định thời hạn tạo, đăng ký và duyệt. Có thể đổi lại ở bước sau.</p>
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      {kinds(waitMinutes).map(({ value, icon: Icon, title, summary, facts }) => <button key={value} type="button" onClick={() => onPick(value)} aria-label={title}
        className="group flex flex-col rounded-2xl border border-[#e2e8f0] bg-white p-4 text-left transition-[border-color,box-shadow] duration-200 hover:border-[#93b4ef] hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] motion-reduce:transition-none">
        <span className={`grid size-10 place-items-center rounded-xl ${value === 'quick' ? 'bg-[#fffaf0] text-[#b7791f]' : 'bg-[#eff6ff] text-[#2563eb]'}`}><Icon size={20} aria-hidden="true" /></span>
        <span className="mt-3 block text-[15px] font-semibold text-[#0f172a]">{title}</span>
        <span className="mt-0.5 block text-[13px] text-[#64748b]">{summary}</span>
        <ul className="mt-3 space-y-1.5 border-t border-[#f1f5f9] pt-3 text-[13px] text-[#334155]">
          {facts.map(fact => <li key={fact} className="flex items-start gap-2"><Check size={14} className="mt-0.5 shrink-0 text-[#64748b]" aria-hidden="true" />{fact}</li>)}
        </ul>
        <span className="mt-4 inline-flex items-center gap-1 text-[13px] font-semibold text-[#2563eb]">Chọn {title}<ArrowRight size={14} className="transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden="true" /></span>
      </button>)}
    </div>
  </section>
}

const slotClass = (chosen: boolean, available: boolean) =>
  `rounded-xl border px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] disabled:cursor-not-allowed ${chosen ? 'border-[#2563eb] bg-[#eff6ff]' : available ? 'border-[#e2e8f0] bg-white hover:border-[#93b4ef]' : 'border-[#eef1f4] bg-[#f8fafc] text-[#64748b]'}`

function ShiftButton({ slot, chosen, onPick }: { slot: TourSlot; chosen: boolean; onPick: () => void }) {
  return <button type="button" disabled={!slot.available} aria-pressed={chosen} onClick={onPick} className={slotClass(chosen, slot.available)}>
    <span className="block font-semibold tabular-nums">{shiftLabel(slot)}</span>
    <span className="block text-xs">{slot.available ? 'Còn trống' : slot.reason}</span>
  </button>
}

function Review({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex justify-between gap-4"><dt className="text-[#64748b]">{label}</dt><dd className="text-right font-medium text-[#0f172a]">{children}</dd></div>
}
