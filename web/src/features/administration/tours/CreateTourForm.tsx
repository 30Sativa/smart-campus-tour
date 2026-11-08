import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { panelClass } from '../../../components/ui/ConsolePrimitives'
import { buttonClass, inputClass } from '../../../components/ui/ui-classes'
import { Notice } from '../AdminUi'
import { useTestedRoutes, useTourOperators, useTourRobots, useTourSlots } from './hooks'
import { campusDay, campusStamp, campusTime, formatDuration } from './tour-calendar'
import { tourError } from './tour-messages'
import type { CreateTourInput, TourSlot } from './types'

/** A new Tour names one tested route revision, one physical robot, one Operator and one free slot or typed time (ADR-0034, ADR-0035, ADR-0036). */
export function CreateTourForm({ busy, error, onSubmit }: { busy: boolean; error: string | null; onSubmit: (input: CreateTourInput) => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [routeRevisionId, setRouteRevisionId] = useState('')
  const [robotCode, setRobotCode] = useState('')
  const [operatorUserId, setOperatorUserId] = useState('')
  const [date, setDate] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [customOpen, setCustomOpen] = useState(false)
  const [customTime, setCustomTime] = useState('')
  const [video, setVideo] = useState('')
  const [clientError, setClientError] = useState('')
  const routes = useTestedRoutes()
  const robots = useTourRobots(routeRevisionId)
  const operators = useTourOperators()
  const slots = useTourSlots(routeRevisionId, robotCode, date)
  const selected = routes.data?.find(route => route.revisionId === routeRevisionId)
  const custom = useTourSlots(routeRevisionId, robotCode, customOpen ? date : '', customTime)
  const day = slots.data?.days[0]
  const customSlot = custom.data?.days[0]?.slots.find(item => item.time === customTime)
  const timing = customOpen ? custom.data : slots.data
  // Derived, so a slot that stops being free after a refresh drops out of the review by itself.
  const picked = customOpen ? customSlot : day?.slots.find(item => item.startsAt === startsAt)
  const usable = picked?.available ? picked : undefined
  const ready = Boolean(selected && robotCode && operatorUserId && usable)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (busy || !ready || !usable) return
    if (!name.trim()) return setClientError('Nhập tên Tour.')
    setClientError('')
    onSubmit({ name: name.trim(), description: description.trim() || null, routeRevisionId, robotCode, operatorUserId, scheduledStartAt: usable.startsAt, fallbackVideoUrl: video.trim() || null })
  }

  return <form onSubmit={submit} className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
    <fieldset disabled={busy} className={`${panelClass} space-y-4 p-4`}>
      <legend className="sr-only">Thông tin Tour</legend>
      {(clientError || error) && <Notice tone="danger">{clientError || error}</Notice>}
      <label className="block text-sm">Tên Tour<input required maxLength={150} className={inputClass} value={name} onChange={e => setName(e.target.value)} placeholder="Ví dụ: Tham quan từ xa · Sáng thứ Bảy" /></label>
      <label className="block text-sm">Mô tả<textarea maxLength={1000} rows={3} className={inputClass} value={description} onChange={e => setDescription(e.target.value)} placeholder="Nội dung ngắn đại diện trường sẽ thấy khi đăng ký." /></label>
      <label className="block text-sm">Tuyến đã kiểm chứng<select title="" required aria-label="Tuyến đã kiểm chứng" className={inputClass} value={routeRevisionId} disabled={routes.isPending} onChange={e => { setRouteRevisionId(e.target.value); setRobotCode('') }}>
        <option value="">— Chọn tuyến —</option>
        {routes.data?.map(route => <option key={route.revisionId} value={route.revisionId}>{route.name} · phiên bản {route.revisionNumber} · {route.stops.length} điểm dừng</option>)}
      </select>
        {routes.isError ? <span role="alert" className="mt-1 block text-xs text-[#b23e31]">Không tải được danh mục tuyến.</span>
          : routes.data?.length === 0 ? <span role="status" className="mt-1 block text-xs text-[#b23e31]">Chưa có tuyến nào chạy thử đạt. Gửi kiểm chứng ở Danh mục tuyến và chờ Kỹ thuật ghi kết quả.</span>
          : <span className="mt-1 block text-xs text-[#64748b]">Chỉ hiện tuyến đã gửi kiểm chứng và có kết quả chạy thử đạt.</span>}</label>
      <label className="block text-sm">Robot<select title="" required aria-label="Robot" className={inputClass} value={robotCode} disabled={!routeRevisionId || robots.isPending} onChange={e => setRobotCode(e.target.value)}>
        <option value="">— Chọn robot vật lý —</option>
        {robots.data?.map(robot => <option key={robot.robotCode} value={robot.robotCode} disabled={!robot.usable}>{robot.displayName ? `${robot.displayName} · ` : ''}{robot.robotCode}{robot.blockReason ? ` (${robot.blockReason})` : ''}</option>)}
      </select>
        {robots.isError ? <span role="alert" className="mt-1 block text-xs text-[#b23e31]">Không tải được danh sách robot.</span>
          : !routeRevisionId ? <span className="mt-1 block text-xs text-[#64748b]">Chọn tuyến trước để biết robot nào chạy được.</span>
          : robots.data && !robots.data.some(robot => robot.usable) && <span role="status" className="mt-1 block text-xs text-[#b23e31]">Chưa có robot nào sẵn sàng cho tuyến này.</span>}</label>
      <label className="block text-sm">Người vận hành<select title="" required aria-label="Người vận hành" className={inputClass} value={operatorUserId} disabled={operators.isPending} onChange={e => setOperatorUserId(e.target.value)}>
        <option value="">— Chọn Staff —</option>
        {operators.data?.map(person => <option key={person.userId} value={person.userId}>{person.fullName} · {person.username}</option>)}
      </select>
        {operators.isError && <span role="alert" className="mt-1 block text-xs text-[#b23e31]">Không tải được danh sách Staff.</span>}</label>
      <label className="block text-sm">Ngày tổ chức<input required type="date" className={inputClass} min={campusDay(new Date())} value={date} disabled={!routeRevisionId || !robotCode} onChange={e => setDate(e.target.value)} />
        <span className="mt-1 block text-xs text-[#64748b]">{routeRevisionId && robotCode ? 'Giờ Việt Nam. Tới giờ robot không tự chạy; Staff bắt đầu thủ công.' : 'Chọn tuyến và robot trước để xem khung giờ.'}</span></label>
      <div role="group" aria-label="Khung giờ">
        <p className="text-sm">Khung giờ</p>
        {slots.data?.leadTimeHours !== undefined && slots.data.registrationCloseHours !== undefined &&
          <p className="mt-0.5 text-xs text-[#64748b]">Cần tạo trước giờ bắt đầu ít nhất {slots.data.leadTimeHours} giờ; đăng ký đóng {slots.data.registrationCloseHours} giờ trước giờ bắt đầu.</p>}
        {!date ? <p className="mt-1 text-xs text-[#64748b]">Chọn ngày để xem khung giờ.</p>
          : slots.isPending ? <p aria-busy="true" className="mt-1 text-xs text-[#64748b]">Đang tải khung giờ…</p>
          : slots.isError ? <p role="alert" className="mt-1 text-xs text-[#b23e31]">{tourError(slots.error)}</p>
          : <>
            <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
              {day?.slots.map(item => <SlotButton key={item.startsAt} slot={item} chosen={!customOpen && item.startsAt === startsAt} onPick={() => { setCustomOpen(false); setStartsAt(item.startsAt) }} />)}
              <button type="button" aria-pressed={customOpen} onClick={() => setCustomOpen(true)} className={slotClass(customOpen, true)}>
                <span className="block font-semibold">Giờ khác</span>
                <span className="block text-xs">Từ {slots.data?.customStartEarliest} đến {slots.data?.customStartLatest}</span>
              </button>
            </div>
            {customOpen && <label className="mt-3 block text-sm">Giờ bắt đầu<input required type="time" className={inputClass} min={slots.data?.customStartEarliest} max={slots.data?.customStartLatest} value={customTime} onChange={e => setCustomTime(e.target.value)} />
              <CustomTimeStatus time={customTime} pending={custom.isFetching} error={custom.isError ? tourError(custom.error) : null} slot={customSlot} /></label>}
          </>}
      </div>
      <label className="block text-sm">Video dự phòng (không bắt buộc)<input type="url" maxLength={1000} className={inputClass} value={video} onChange={e => setVideo(e.target.value)} placeholder="https://…" /></label>
      <div className="flex flex-col-reverse gap-2 border-t border-[#f1f5f9] pt-4 sm:flex-row sm:justify-end">
        <Link to="/staff/schedule" className={buttonClass('secondary')}>Hủy bỏ</Link>
        <button type="submit" disabled={busy || !ready} className={buttonClass('primary')}>{busy ? 'Đang lưu…' : 'Tạo Tour'}</button>
      </div>
    </fieldset>

    <div className="space-y-3">
      {usable && timing && <section className={`${panelClass} p-4`} aria-label="Xem lại trước khi tạo">
        <h2 className="text-[15px] font-semibold">Xem lại trước khi tạo</h2>
        <dl className="mt-3 space-y-2 text-sm">
          <Review label="Bắt đầu">{campusStamp(usable.startsAt)}</Review>
          <Review label="Thời lượng dự kiến">{formatDuration(timing.expectedDurationSeconds!)}
            {timing.expectedDurationSeconds !== timing.measuredDurationSeconds && <span className="block text-xs text-[#64748b]">Chạy thử đo {formatDuration(timing.measuredDurationSeconds!)}, cộng thêm thời gian dừng đã tăng.</span>}</Review>
          <Review label="Giữ robot">{campusTime(usable.reservationStartsAt!)} - {campusTime(usable.reservationEndsAt!)}</Review>
          <Review label="Đóng đăng ký">{campusStamp(usable.registrationClosesAt)}</Review>
        </dl>
      </section>}
      <section className={`${panelClass} p-4`} aria-label="Xem trước tuyến">
        <h2 className="text-[15px] font-semibold">Xem trước tuyến</h2>
        {!selected ? <p className="py-10 text-center text-sm text-[#94a3b8]">Chọn một tuyến để xem các điểm dừng.</p>
          : <div className="mt-3 space-y-3">
            <p className="text-sm text-[#64748b]">{selected.mapKey} · phiên bản {selected.revisionNumber}</p>
            <ol className="divide-y divide-[#e2e8f0]">{selected.stops.map(stop => <li key={stop.poiRevisionId} className="py-2.5 text-sm">
              <span className="font-medium">{stop.stopOrder}. {stop.name}</span>
              <span className="block text-xs text-[#64748b]">Dừng {stop.dwellSeconds}s</span>
            </li>)}</ol>
          </div>}
      </section>
    </div>
  </form>
}

const slotClass = (chosen: boolean, available: boolean) =>
  `rounded-xl border px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] disabled:cursor-not-allowed ${chosen ? 'border-[#2563eb] bg-[#eff6ff]' : available ? 'border-[#e2e8f0] bg-white hover:border-[#93b4ef]' : 'border-[#eef1f4] bg-[#f8fafc] text-[#64748b]'}`

function CustomTimeStatus({ time, pending, error, slot }: { time: string; pending: boolean; error: string | null; slot?: TourSlot }) {
  if (!time) return <span className="mt-1 block text-xs text-[#64748b]">Giờ Việt Nam. Nhập giờ để kiểm tra robot còn trống.</span>
  if (pending) return <span aria-busy="true" className="mt-1 block text-xs text-[#64748b]">Đang kiểm tra giờ…</span>
  if (error) return <span role="alert" className="mt-1 block text-xs text-[#b23e31]">{error}</span>
  return slot?.available ? <span role="status" className="mt-1 block text-xs text-[#64748b]">Còn trống</span>
    : <span role="alert" className="mt-1 block text-xs text-[#b23e31]">{slot?.reason}</span>
}

function SlotButton({ slot, chosen, onPick }: { slot: TourSlot; chosen: boolean; onPick: () => void }) {
  return <button type="button" disabled={!slot.available} aria-pressed={chosen} onClick={onPick} className={slotClass(chosen, slot.available)}>
    <span className="block font-semibold tabular-nums">{slot.time}</span>
    <span className="block text-xs">{slot.available ? 'Còn trống' : slot.reason}</span>
  </button>
}

function Review({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex justify-between gap-4"><dt className="text-[#64748b]">{label}</dt><dd className="text-right font-medium text-[#0f172a]">{children}</dd></div>
}
