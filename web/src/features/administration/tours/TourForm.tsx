import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { panelClass } from '../../../components/ui/ConsolePrimitives'
import { buttonClass, inputClass } from '../../../components/ui/ui-classes'
import { Notice } from '../AdminUi'
import { fromLocalInput, toLocalInput } from '../admin-format'
import { useRoute, useRoutes } from '../routes/hooks'
import { routeIssue } from '../routes/route-messages'
import type { TourInput } from './types'

const HEAD_LABEL = { FRONT: 'trước', LEFT: 'trái', RIGHT: 'phải' }

/**
 * Create/edit a live Tour. Routes come from the live catalog (active only); the
 * selected Route's detail supplies its revision, which the API checks on create
 * or on a Route change, and the read-only stop preview.
 */
export function TourForm({ initial, currentRoute, fixedStops, scheduleLocked = false, submitLabel, busy, error, cancelTo, onSubmit }: {
  initial?: TourInput
  currentRoute?: { id: string; name: string }
  /** A Tour on a route revision: its route cannot change and has no legacy Route detail to load. */
  fixedStops?: { order: number; name: string; dwellSeconds: number }[]
  scheduleLocked?: boolean
  submitLabel: string
  busy: boolean
  error: string | null
  cancelTo: string
  onSubmit: (input: TourInput, routeVersion: string) => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [schedule, setSchedule] = useState(toLocalInput(initial?.scheduledStartAt))
  const [routeId, setRouteId] = useState(initial?.routeId ?? '')
  const [video, setVideo] = useState(initial?.fallbackVideoUrl ?? '')
  const [clientError, setClientError] = useState('')
  const routes = useRoutes({ isActive: true, page: 1, size: 100 })
  const route = useRoute(fixedStops ? undefined : routeId || undefined)
  const routeReady = Boolean(fixedStops || route.data)
  const options = routes.data?.data.map(r => ({ id: r.id, name: `${r.name} · ${r.stopCount} điểm dừng` })) ?? []
  if (currentRoute && !options.some(o => o.id === currentRoute.id)) options.unshift({ id: currentRoute.id, name: `${currentRoute.name} (đang dùng)` })
  const scheduleChanged = schedule !== toLocalInput(initial?.scheduledStartAt)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (busy || !routeReady) return
    const at = fromLocalInput(schedule)
    if (!name.trim()) return setClientError('Nhập tên Tour.')
    if (!at) return setClientError('Chọn ngày và giờ dự kiến.')
    if ((!initial || scheduleChanged) && new Date(at).getTime() <= Date.now()) return setClientError('Giờ dự kiến phải ở tương lai.')
    setClientError('')
    onSubmit({ name: name.trim(), description: description.trim() || null, routeId, scheduledStartAt: at, fallbackVideoUrl: video.trim() || null }, route.data?.version ?? '')
  }

  return <form onSubmit={submit} className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
    <fieldset disabled={busy} className={`${panelClass} space-y-4 p-4`}>
      <legend className="sr-only">Thông tin Tour</legend>
      {(clientError || error) && <Notice tone="danger">{clientError || error}</Notice>}
      <label className="block text-sm">Tên Tour<input required maxLength={150} className={inputClass} value={name} onChange={e => setName(e.target.value)} placeholder="Ví dụ: Tham quan từ xa · Sáng thứ Bảy" /></label>
      <label className="block text-sm">Thời gian dự kiến<input required type="datetime-local" disabled={scheduleLocked || Boolean(fixedStops)} className={inputClass} value={schedule} onChange={e => setSchedule(e.target.value)} />
        <span className="mt-1 block text-xs text-[#64748b]">Giờ theo máy đang dùng. Tới giờ robot không tự chạy; Staff bắt đầu thủ công.</span></label>
      <label className="block text-sm">Mô tả<textarea maxLength={1000} rows={3} className={inputClass} value={description} onChange={e => setDescription(e.target.value)} placeholder="Nội dung ngắn đại diện trường sẽ thấy khi đăng ký." /></label>
      <label className="block text-sm">Tuyến<select title="" required aria-label="Tuyến" disabled={scheduleLocked || Boolean(fixedStops)} className={inputClass} value={routeId} onChange={e => setRouteId(e.target.value)}>
        <option value="">— Chọn tuyến khả dụng —</option>
        {options.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
        <span className="mt-1 block text-xs text-[#64748b]">{routes.isError ? 'Không tải được danh mục tuyến.' : fixedStops ? 'Tour gắn với đúng phiên bản tuyến này.' : 'Danh sách này chỉ có tuyến kiểu cũ.'}</span></label>
      <label className="block text-sm">Video dự phòng (không bắt buộc)<input type="url" maxLength={1000} className={inputClass} value={video} onChange={e => setVideo(e.target.value)} placeholder="https://…" /></label>
      {fixedStops ? <Notice tone="info">Muốn đổi lịch, tuyến hoặc robot, hãy hủy Tour rồi tạo lại; ở đây chỉ sửa được tên, mô tả và video.</Notice>
        : scheduleLocked && <Notice tone="info">Tour đã có đăng ký hoặc lịch sử nên lịch và tuyến bị khóa; chỉ sửa được tên, mô tả và video.</Notice>}
      <div className="flex flex-col-reverse gap-2 border-t border-[#f1f5f9] pt-4 sm:flex-row sm:justify-end">
        <Link to={cancelTo} className={buttonClass('secondary')}>Hủy bỏ</Link>
        <button type="submit" disabled={busy || !routeReady} className={buttonClass('primary')}>{busy ? 'Đang lưu…' : submitLabel}</button>
      </div>
    </fieldset>

    <section className={`${panelClass} p-4`} aria-label="Xem trước tuyến">
      <h2 className="text-[15px] font-semibold">Xem trước tuyến</h2>
      {fixedStops ? <ol className="mt-3 divide-y divide-[#e2e8f0]">{fixedStops.map(stop => <li key={stop.order} className="py-2.5 text-sm">
        <span className="font-medium">{stop.order}. {stop.name}</span>
        <span className="block text-xs text-[#64748b]">Dừng {stop.dwellSeconds}s</span>
      </li>)}</ol>
        : !routeId ? <p className="py-10 text-center text-sm text-[#94a3b8]">Chọn một tuyến để xem các điểm dừng.</p>
        : route.isError ? <p className="py-6 text-sm text-[#9d3428]">Không tải được cấu hình tuyến.</p>
        : !route.data ? <p className="py-6 text-sm" role="status">Đang tải tuyến…</p>
        : <div className="mt-3 space-y-3">
          <p className="text-sm text-[#64748b]">{route.data.mapKey} / {route.data.mapFrame} · kết thúc {route.data.endMode === 'LAST_POI' ? 'tại POI cuối' : 'ở pose riêng'}</p>
          {route.data.availabilityIssues.length > 0 && <Notice tone="warn">{route.data.availabilityIssues.map(routeIssue).join(' ')}</Notice>}
          <ol className="divide-y divide-[#e2e8f0]">{route.data.stops.map(stop => <li key={stop.id} className="py-2.5 text-sm">
            <span className="font-medium">{stop.stopOrder}. {stop.poiName}</span>
            <span className="block text-xs text-[#64748b]">Dừng {stop.dwellSeconds}s · nhìn {stop.headSteps.map(h => `${HEAD_LABEL[h.preset]} ${h.holdSeconds}s`).join(', ')}</span>
          </li>)}</ol>
        </div>}
    </section>
  </form>
}
