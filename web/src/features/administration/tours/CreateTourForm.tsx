import { useState, type FormEvent } from 'react'
import { CalendarDays, Check, ClipboardList, ImageIcon, Route as RouteIcon, Zap, type LucideIcon } from 'lucide-react'
import { Link, useSearchParams } from 'react-router'
import { DateInput } from '../../../components/ui/DateInput'
import { formatDate, formatDateTime, formatExpectedDuration, formatMinutesSeconds, formatTime } from '../../../components/ui/date-time'
import { useAuthStore } from '../../../stores/auth-store'
import { Notice } from '../AdminUi'
import { passedAt, scheduleFitLabel } from '../routes/route-messages'
import { useMapVersions } from '../../technical/technical-hooks'
import { SaveBlockedHint } from '../../technical/TechnicalUi'
import { useTestedRoutes, useTourOperators, useTourRobots, useTourShifts, useTourSlots } from './hooks'
import { campusDay } from './tour-calendar'
import { tourError } from './tour-messages'
import type { VersionedRoute } from '../routes/versioned-api'
import { QUICK_TOUR_RULES, tourKindOf, type TourKind } from './quick-tour'
import type { CreateTourInput, TourRobotOption, TourSlot } from './types'
import { FallbackVideoField } from './FallbackVideoField'
import { CoverImageField } from './CoverImageField'
import './create-tour.css'

const DATE_PARAM = /^\d{4}-\d{2}-\d{2}$/
/** When a shift's Tour must have ended: its start plus the most the shift holds. */
const tourEnd = (slot: TourSlot) => new Date(new Date(slot.startsAt).getTime() + slot.maxDurationSeconds * 1000).toISOString()
/** "Ca sáng · 08:15-09:45 · Giữ robot 08:00-10:00" */
const shiftLabel = (slot: TourSlot) =>
  `${slot.shiftName} · ${slot.time}-${formatTime(tourEnd(slot))} · Giữ robot ${formatTime(slot.reservationStartsAt)}-${formatTime(slot.reservationEndsAt)}`

/** Why this route cannot be chosen (docs/lich-tour-theo-ca.md §4); null when it can. */
const routeBlockReason = (route: VersionedRoute) =>
  route.scheduleFit === 'TOO_LONG_FOR_SHIFT' ? scheduleFitLabel(route)!.text : null

/** ADR-0062: no new Tour on a revision with a retired POI. Asked first, as create checks it first (ROUTE_HAS_RETIRED_POI). */
const retiredPoiReason = (route: VersionedRoute) =>
  route.retiredPoiNames?.length ? `có POI ngưng dùng: ${route.retiredPoiNames.join(', ')}` : null
const pickBlockReason = (route: VersionedRoute) => retiredPoiReason(route) ?? routeBlockReason(route)

/** A quick Tour holds its robot from now, so a robot another Tour holds over that hold cannot be chosen (create re-checks). */
const robotPickable = (robot: TourRobotOption, quick: boolean) => robot.usable && !(quick && robot.heldByTourName)
/**
 * Why an option is off, or what it still needs. A robot waiting for its on-site check stays pickable: it may be
 * released before the Tour starts, and only Start refuses it (robotNotNeedsInspection).
 */
const robotNote = (robot: TourRobotOption, quick: boolean) =>
  robot.blockReason ? ` (${robot.blockReason})`
    : quick && robot.heldByTourName ? ` (đang giữ cho Tour ${robot.heldByTourName}${robot.heldUntil ? ` tới ${formatTime(robot.heldUntil)}` : ''})`
    : robot.needsInspection ? ' (chờ kiểm tra tại chỗ, phải trả robot trước khi bắt đầu)' : ''

type CreateTourFormProps = {
  busy: boolean; error: string | null
  /** `cover`: the picked cover image, uploaded by the page once the Tour exists. */
  onSubmit: (input: CreateTourInput, cover: File | null) => void
}

/**
 * A new Tour names one tested route revision, one physical robot and one Operator. A Tour on a shift also names one free
 * shift (ADR-0034, docs/lich-tour-theo-ca.md §3): `?date=YYYY-MM-DD&shift=S1` picks the day and shift in advance. A quick
 * Tour (ADR-0053) names none: it holds the robot from now and may start once ready. `?route=<revisionId>` picks the route.
 */
export function CreateTourForm({ busy, error, onSubmit }: CreateTourFormProps) {
  const [params, setParams] = useSearchParams()
  // Open the form immediately; explicit quick and legacy short links still select the quick kind.
  const kind = tourKindOf(params.get('kind')) ?? 'normal'
  const quick = kind === 'quick'
  const chooseKind = (next: TourKind) => setParams(prev => { const copy = new URLSearchParams(prev); copy.set('kind', next); return copy })
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
  const [cover, setCover] = useState<File | null>(null)
  const [capacity, setCapacity] = useState('20')
  const [quickReason, setQuickReason] = useState('')
  const routes = useTestedRoutes()
  const linkedRouteId = params.get('route')
  const linkedRoute = linkedRouteId ? routes.data?.find(route => route.revisionId === linkedRouteId) : undefined
  const linkedUsable = linkedRoute != null && pickBlockReason(linkedRoute) === null
  const linkedRetired = linkedRoute != null && pickedRouteId === null ? linkedRoute.retiredPoiNames ?? [] : []
  // A picked route that a refresh blocks (a POI retired meanwhile) drops out, so the review never shows it as usable.
  const pickedRoute = pickedRouteId ? routes.data?.find(route => route.revisionId === pickedRouteId) : undefined
  const routeRevisionId = pickedRouteId !== null ? (pickedRoute && pickBlockReason(pickedRoute) === null ? pickedRoute.revisionId : '')
    : linkedUsable ? linkedRoute.revisionId : ''
  const noRouteUsable = Boolean(routes.data?.length) && routes.data!.every(route => pickBlockReason(route) !== null)
  const robots = useTourRobots(routeRevisionId, quick)
  const operators = useTourOperators()
  const operatorUserId = pickedOperatorId ?? (signedIn && operators.data?.some(person => person.userId === signedIn) ? signedIn : '')
  const slots = useTourSlots(routeRevisionId, robotCode, date, !quick)
  const today = campusDay(new Date())
  // Only for the wait shown to Staff; the server sets the quick Tour's latest Start when it creates it.
  const waitMinutes = useTourShifts(today, today, quick).data?.quickTourWaitMinutes
  // B12: the server's preview of the quick Tour create would make now; the same for every robot of the route.
  const quickPreview = quick ? (robots.data?.find(robot => robot.robotCode === robotCode) ?? robots.data?.[0])?.quick : null
  const maps = useMapVersions()
  const selected = routes.data?.find(route => route.revisionId === routeRevisionId)
  const selectedArea = maps.data?.find(item => item.map.id === selected?.mapVersionId)?.map.areaName
  const selectedPassedAt = selected && passedAt(selected)
  const day = slots.data?.days[0]
  // Derived, so a shift that stops being free after a refresh drops out of the review by itself.
  const picked = day?.slots.find(item => item.shiftCode === shiftCode)
  const usable = picked?.available ? picked : undefined
  // BR-26: the server refuses more than its configured maximum; said here in Vietnamese instead of the browser's English bubble.
  const maxCapacity = slots.data?.maxCapacity ?? 20
  const capacityValue = Number(capacity)
  const capacityProblem = capacity.trim() === '' || !Number.isInteger(capacityValue) || capacityValue < 1 || capacityValue > maxCapacity
    ? `sức chứa từ 1 đến ${maxCapacity} chỗ` : null
  // What still stops "Tạo Tour", in the order of the fields, shown beside the disabled button.
  const missing = [
    !name.trim() && 'nhập tên Tour',
    quick && !quickReason.trim() && 'nhập lý do tạo gấp',
    !selected && 'chọn tuyến',
    !robotCode && 'chọn robot',
    !operatorUserId && 'chọn người vận hành',
    !quick && !date && 'chọn ngày',
    !quick && !usable && (picked ? 'chọn ca còn trống' : 'chọn ca'),
    capacityProblem,
  ].filter((item): item is string => Boolean(item))
  const ready = missing.length === 0
  const expected = slots.data?.expectedDurationSeconds
  const overRecommended = expected != null && slots.data != null && expected > slots.data.recommendedMaxSeconds

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (busy || !ready) return
    const common = { name: name.trim(), description: description.trim() || null, routeRevisionId, robotCode, operatorUserId, fallbackVideoUrl: video.trim() || null, capacity: Number(capacity) }
    if (quick) onSubmit({ ...common, scheduledStartAt: null, shortNoticeReason: quickReason.trim() }, cover)
    else if (usable) onSubmit({ ...common, scheduledStartAt: usable.startsAt }, cover)
  }

  return <form onSubmit={submit} className="tour-create-form">
    <fieldset disabled={busy} className="tour-create-fields">
      <legend className="sr-only">Thông tin Tour</legend>
      {error && <Notice tone="danger">{error}</Notice>}
      <section className="tour-create-section" aria-labelledby="create-tour-info-title">
      <div className="tour-create-section-heading"><ClipboardList size={18} aria-hidden="true" /><h2 id="create-tour-info-title">Thông tin Tour</h2>
      </div>
      <div className="tour-create-kinds" role="group" aria-label="Loại Tour">
        {tourKinds.map(({ value, icon: Icon, title }) => <button key={value} type="button" aria-pressed={value === kind} onClick={() => chooseKind(value)}>
          <Icon size={18} aria-hidden="true" />{title}<Check size={16} className="tour-create-kind-check" aria-hidden="true" />
        </button>)}
      </div>
      <p className="tour-create-kind-help">{quick ? QUICK_TOUR_RULES.summary : 'Tạo trước giờ bắt đầu ít nhất 72 giờ. Đăng ký đóng trước 48 giờ; Staff duyệt đơn trước 24 giờ.'}</p>
      <label className="tour-create-field">Tên Tour<input required maxLength={150} className="tour-create-input" value={name} onChange={e => setName(e.target.value)} placeholder="Ví dụ: Tham quan từ xa · Sáng thứ Bảy" /></label>
      {quick && <label className="tour-create-field">Lý do tạo gấp<textarea required maxLength={500} rows={2} className="tour-create-input" value={quickReason} onChange={e => setQuickReason(e.target.value)} placeholder="Ví dụ: Buổi trình diễn với đoàn khách của nhà trường." /></label>}
      <label className="tour-create-field">Mô tả<textarea maxLength={1000} rows={3} className="tour-create-input" value={description} onChange={e => setDescription(e.target.value)} placeholder="Nội dung ngắn đại diện trường sẽ thấy khi đăng ký." /></label>
      </section>
      <section className="tour-create-section" aria-labelledby="create-tour-route-title">
      <div className="tour-create-section-heading"><RouteIcon size={18} aria-hidden="true" /><h2 id="create-tour-route-title">Tuyến &amp; vận hành</h2></div>
      <label className="tour-create-field">Tuyến đã kiểm chứng<select title="" required aria-label="Tuyến đã kiểm chứng" className="tour-create-input" value={routeRevisionId} disabled={routes.isPending} onChange={e => { setPickedRouteId(e.target.value); setRobotCode('') }}>
        <option value="">Chọn tuyến</option>
        {/* docs/lich-tour-theo-ca.md §4: a route no shift can hold is shown but cannot be chosen. */}
        {routes.data?.map(route => {
          const blocked = pickBlockReason(route)
          return <option key={route.revisionId} value={route.revisionId} disabled={blocked !== null}>{route.name} · {route.stops.length} điểm dừng{blocked ? ` (${blocked})` : ''}</option>
        })}
      </select>
        {routes.isError ? <span role="alert" className="mt-1 block text-xs tour-create-danger">Không tải được danh mục tuyến.</span>
          : linkedRetired.length ? null
          : linkedRouteId && routes.data && !linkedUsable && pickedRouteId === null ? <span role="status" className="mt-1 block text-xs tour-create-danger">Tuyến vừa mở chưa dùng được để tạo Tour. Chọn tuyến khác.</span>
          : routes.data?.length === 0 ? <span role="status" className="mt-1 block text-xs tour-create-danger">Chưa có tuyến nào chạy thử đạt. Gửi kiểm chứng ở Danh mục tuyến và chờ Kỹ thuật ghi kết quả.</span>
          : <span className="mt-1 block text-xs tour-create-muted">Chỉ hiện tuyến đã gửi kiểm chứng và có kết quả chạy thử đạt. Tuyến quá dài cho 1 ca thì chưa chọn được.</span>}</label>
      {linkedRetired.length > 0 && <Notice tone="warn" action={<Link to={`/staff/manage/routes/${linkedRoute!.routeId}`} className="text-sm whitespace-nowrap tour-create-link hover:underline">Xem tuyến</Link>}>
        Tuyến vừa mở ({linkedRoute!.name}) có POI đã ngưng dùng: {linkedRetired.join(', ')}. Không tạo được Tour mới trên tuyến này. Lưu phiên bản tuyến mới không có POI này, hoặc dùng lại POI; hoặc chọn tuyến khác.
      </Notice>}
      {noRouteUsable && <Notice tone="warn">
        <p className="font-semibold">Chưa có tuyến nào dùng được để tạo Tour.</p>
        <ul className="mt-1 list-disc pl-5" aria-label="Lý do từng tuyến">{routes.data!.map(route => {
          const reason = pickBlockReason(route)
          return <li key={route.revisionId}>{route.name}: {reason}.</li>
        })}</ul>
      </Notice>}
      <div className="tour-create-pair"><label className="tour-create-field">Robot<select title="" required aria-label="Robot" className="tour-create-input" value={robotCode} disabled={!routeRevisionId || robots.isPending} onChange={e => setRobotCode(e.target.value)}>
        <option value="">Chọn robot vật lý</option>
        {robots.data?.map(robot => <option key={robot.robotCode} value={robot.robotCode} disabled={!robotPickable(robot, quick)}>{robot.displayName ? `${robot.displayName} · ` : ''}{robot.robotCode}{robotNote(robot, quick)}</option>)}
      </select>
        {robots.isError ? <span role="alert" className="mt-1 block text-xs tour-create-danger">Không tải được danh sách robot.</span>
          : !routeRevisionId ? <span className="mt-1 block text-xs tour-create-muted">Chọn tuyến trước để biết robot nào chạy được.</span>
          : robots.data && !robots.data.some(robot => robotPickable(robot, quick)) && <span role="status" className="mt-1 block text-xs tour-create-danger">Chưa có robot nào sẵn sàng cho tuyến này.</span>}</label>
      <label className="tour-create-field">Người vận hành<select title="" required aria-label="Người vận hành" className="tour-create-input" value={operatorUserId} disabled={operators.isPending} onChange={e => setPickedOperatorId(e.target.value)}>
        <option value="">Chọn Staff</option>
        {operators.data?.map(person => <option key={person.userId} value={person.userId}>{person.fullName} · {person.username}</option>)}
      </select>
        {operators.isError && <span role="alert" className="mt-1 block text-xs tour-create-danger">Không tải được danh sách Staff.</span>}</label>
      </div>
      </section>
      <section className="tour-create-section" aria-labelledby="create-tour-schedule-title">
      <div className="tour-create-section-heading"><CalendarDays size={18} aria-hidden="true" /><h2 id="create-tour-schedule-title">Lịch &amp; sức chứa</h2></div>
      {quick && <p className="tour-create-schedule-note">Tour nhanh giữ robot ngay từ lúc tạo. Bắt đầu khi Tour đã chốt và robot sẵn sàng.</p>}
      {quick ? null : <>
      <label className="tour-create-field">Ngày tổ chức<DateInput className="tour-create-input" required min={campusDay(new Date())} value={date} onChange={setDate} />
        <span className="mt-1 block text-xs text-muted">Giờ Việt Nam. Tới giờ robot không tự chạy; Staff bắt đầu thủ công.</span></label>
      <div className="tour-create-shifts" role="group" aria-label="Ca">
        <p className="text-sm">Ca</p>
        {!routeRevisionId || !robotCode ? <p className="mt-1 text-xs tour-create-muted">Chọn tuyến và robot để xem ca nào còn trống.</p>
          : !date ? <p className="mt-1 text-xs tour-create-muted">Chọn ngày để xem các ca.</p>
          : slots.isPending ? <p aria-busy="true" className="mt-1 text-xs tour-create-muted">Đang tải các ca…</p>
          : slots.isError ? <p role="alert" className="mt-1 text-xs tour-create-danger">{tourError(slots.error)}</p>
          : <div className="mt-1.5 grid gap-2">
            {day?.slots.map(item => <ShiftButton key={item.shiftCode} slot={item} chosen={item.shiftCode === shiftCode} onPick={() => setShiftCode(item.shiftCode)} />)}
            {picked && !picked.available && <p role="alert" className="text-xs tour-create-danger">{picked.shiftName} không dùng được: {picked.reason}. Chọn ca khác.</p>}
          </div>}
      </div></>}
      <label className="tour-create-field">Sức chứa<input required type="number" min={1} max={maxCapacity} step={1} className="tour-create-input" value={capacity} onChange={e => setCapacity(e.target.value)}
          aria-invalid={capacityProblem ? true : undefined} aria-describedby={capacityProblem ? 'create-tour-capacity-error' : undefined} />
        {capacityProblem && <span id="create-tour-capacity-error" role="alert" className="mt-1 block text-xs tour-create-danger">Sức chứa phải từ 1 đến {maxCapacity} chỗ.</span>}
        <span className="mt-1 block text-xs tour-create-muted">Số dòng đăng ký tối đa của cả Tour. Mỗi điểm xem chung tính là 1 chỗ.</span></label>
      </section>
      <section className="tour-create-section tour-create-media" aria-labelledby="create-tour-media-title">
      <div className="tour-create-section-heading"><ImageIcon size={18} aria-hidden="true" /><h2 id="create-tour-media-title">Ảnh &amp; video</h2><span>Không bắt buộc</span></div>
      <CoverImageField file={cover} onChange={setCover} disabled={busy} />
      <FallbackVideoField value={video} onChange={setVideo} disabled={busy} />
      </section>
    </fieldset>

    <aside className="tour-create-review" aria-label="Tóm tắt Tour">
      <section className="tour-create-review-panel" aria-label={quick ? 'Tour nhanh chạy thế nào' : usable && slots.data ? 'Xem lại trước khi tạo' : undefined}>
        <div className="tour-create-section-heading"><ClipboardList size={18} aria-hidden="true" /><h2>Xem lại trước khi tạo</h2></div>
        <p className="tour-create-review-name">{name.trim() || 'Tour chưa đặt tên'}</p>
        <p className="tour-create-review-kind">{quick ? 'Tour nhanh' : 'Tour theo ca'}</p>
        <dl className="tour-create-review-facts">
          <Review label="Tuyến">{selected?.name || 'Chưa chọn'}</Review>
          <Review label="Robot">{robots.data?.find(robot => robot.robotCode === robotCode)?.displayName || robotCode || 'Chưa chọn'}</Review>
          <Review label="Người vận hành">{operators.data?.find(person => person.userId === operatorUserId)?.fullName || 'Chưa chọn'}</Review>
          {!quick && <Review label="Ngày tổ chức">{date ? formatDate(date) : 'Chưa chọn'}</Review>}
          <Review label="Sức chứa">{capacity} chỗ</Review>
        </dl>
        {quick ? <>
        <dl className="tour-create-review-facts tour-create-review-timing">
          <Review label="Giữ robot">{QUICK_TOUR_RULES.hold.value}</Review>
          <Review label="Bắt đầu">{QUICK_TOUR_RULES.start.value}</Review>
          <Review label="Hạn bắt đầu">{QUICK_TOUR_RULES.deadline(waitMinutes).value}</Review>
          {quickPreview && <>
            <Review label="Thời lượng dự kiến">{formatExpectedDuration(quickPreview.expectedDurationSeconds)} (tự tính từ thời gian dừng và quãng đường)</Review>
            <Review label="Nếu tạo lúc này">Bắt đầu trước {formatTime(quickPreview.startBy)}, giữ robot {formatTime(quickPreview.holdStartsAt)} - {formatTime(quickPreview.holdEndsAt)}
              {quickPreview.autoCancelAt && <span className="block">Chưa bắt đầu thì tự hủy lúc {formatTime(quickPreview.autoCancelAt)}.</span>}
              <span className="block text-xs text-muted">Giờ chính xác được tính lại lúc bấm Tạo Tour.</span></Review>
          </>}
          <Review label="Đóng đăng ký">{QUICK_TOUR_RULES.registration}</Review>
        </dl>
        <details className="tour-create-guidance"><summary>Điều kiện bắt đầu và giữ robot</summary>
          <p>{QUICK_TOUR_RULES.hold.note}</p><p>{QUICK_TOUR_RULES.start.note}</p><p>{QUICK_TOUR_RULES.deadline(waitMinutes).note}</p>
        </details>
        </> : <>
        <dl className="tour-create-review-facts tour-create-review-timing">
          <Review label="Ca">{usable?.shiftName || 'Chưa chọn'}</Review>
          <Review label="Bắt đầu">{usable ? formatDateTime(usable.startsAt) : 'Chờ chọn ca'}</Review>
          <Review label="Giữ robot">{usable ? <>{formatTime(usable.reservationStartsAt)} - {formatTime(usable.reservationEndsAt)}</> : 'Chờ chọn ca'}</Review>
          <Review label="Đóng đăng ký">{usable ? formatDateTime(usable.registrationClosesAt) : 'Chờ chọn ca'}</Review>
          <Review label="Thời lượng dự kiến">{usable && expected != null ? <>{formatExpectedDuration(expected)} (tự tính từ thời gian dừng và quãng đường)
            <span className="block text-xs text-muted">Ca này chứa tối đa {formatExpectedDuration(usable.maxDurationSeconds)}.</span></> : 'Chờ chọn ca'}</Review>
        </dl>
        {usable && slots.data && overRecommended && <div className="mt-3"><Notice tone="warn">Tuyến dài {formatExpectedDuration(expected!)}, hơn mức khuyến nghị {formatExpectedDuration(slots.data.recommendedMaxSeconds)}. Vẫn tạo được, nhưng nên cân nhắc tuyến ngắn hơn.</Notice></div>}
        <p className="tour-create-review-note">Sau khi tạo, Tour ở trạng thái Đang nhận đăng ký. Đại diện trường có thể đăng ký đoàn.</p>
        </>}
      </section>
      <section className="tour-create-route-preview" aria-label="Xem trước tuyến">
        <h2>Xem trước tuyến</h2>
        {!selected ? <p className="tour-create-route-empty">Chọn một tuyến để xem các điểm dừng.</p>
          : <div className="mt-3 space-y-3">
            <p className="text-sm text-muted">{selectedArea && `${selectedArea}, `}đã chạy thử đạt{selectedPassedAt && ` ngày ${formatDate(selectedPassedAt)}`}</p>
            <ol className="tour-create-stops">{selected.stops.map(stop => <li key={stop.poiRevisionId} className="py-2.5 text-sm">
              <span className="font-medium">{stop.stopOrder}. {stop.name}</span>
              <span className="block text-xs text-muted">Dừng {formatMinutesSeconds(stop.dwellSeconds)}</span>
            </li>)}</ol>
          </div>}
      </section>
    </aside>
    <div className="tour-create-actions">
      <SaveBlockedHint id="create-tour-missing" tone="neutral" lead="Cần" missing={busy ? [] : missing} />
      <Link to="/staff/schedule" className="tour-create-button">Hủy bỏ</Link>
      <button type="submit" disabled={busy || !ready} aria-describedby={!busy && !ready ? 'create-tour-missing' : undefined} className="tour-create-button tour-create-primary">{busy ? 'Đang lưu…' : 'Tạo Tour'}</button>
    </div>
  </form>
}

type KindOption = { value: TourKind; icon: LucideIcon; title: string }
const tourKinds: KindOption[] = [
  { value: 'normal', icon: CalendarDays, title: 'Tour theo ca' },
  { value: 'quick', icon: Zap, title: 'Tour nhanh' },
]
/** "Ca sáng 08:15–09:45, còn trống": the shift, its Tour time and whether it can be picked, read as one name. */
const shiftAccessibleName = (slot: TourSlot) =>
  `${slot.shiftName} ${slot.time}–${formatTime(tourEnd(slot))}, ${slot.available ? 'còn trống' : slot.reason ?? 'không dùng được'}`

function ShiftButton({ slot, chosen, onPick }: { slot: TourSlot; chosen: boolean; onPick: () => void }) {
  return <button type="button" disabled={!slot.available} aria-pressed={chosen} aria-label={shiftAccessibleName(slot)} onClick={onPick} className="tour-create-shift">
    <span className="block font-semibold tabular-nums">{shiftLabel(slot)}</span>
    <span className="block text-xs">{slot.available ? 'Còn trống' : slot.reason}</span>
  </button>
}

function Review({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="tour-create-review-row"><dt>{label}</dt><dd>{children}</dd></div>
}
