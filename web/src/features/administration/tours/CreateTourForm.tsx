import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { panelClass } from '../../../components/ui/ConsolePrimitives'
import { buttonClass, inputClass } from '../../../components/ui/ui-classes'
import { usePhysicalRobots } from '../../technical/technical-hooks'
import { Notice } from '../AdminUi'
import { fromLocalInput } from '../admin-format'
import { useTestedRoutes, useTourOperators } from './hooks'
import type { CreateTourInput } from './types'

/** A new Tour names one tested route revision, one physical robot and one Operator (ADR-0034). */
export function CreateTourForm({ busy, error, onSubmit }: { busy: boolean; error: string | null; onSubmit: (input: CreateTourInput) => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [schedule, setSchedule] = useState('')
  const [routeRevisionId, setRouteRevisionId] = useState('')
  const [robotCode, setRobotCode] = useState('')
  const [operatorUserId, setOperatorUserId] = useState('')
  const [video, setVideo] = useState('')
  const [clientError, setClientError] = useState('')
  const routes = useTestedRoutes()
  const robots = usePhysicalRobots()
  const operators = useTourOperators()
  const selected = routes.data?.find(route => route.revisionId === routeRevisionId)
  const ready = Boolean(selected && robotCode && operatorUserId)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (busy || !ready) return
    const at = fromLocalInput(schedule)
    if (!name.trim()) return setClientError('Nhập tên Tour.')
    if (!at) return setClientError('Chọn ngày và giờ dự kiến.')
    if (new Date(at).getTime() <= Date.now()) return setClientError('Giờ dự kiến phải ở tương lai.')
    setClientError('')
    onSubmit({ name: name.trim(), description: description.trim() || null, routeRevisionId, robotCode, operatorUserId, scheduledStartAt: at, fallbackVideoUrl: video.trim() || null })
  }

  return <form onSubmit={submit} className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
    <fieldset disabled={busy} className={`${panelClass} space-y-4 p-4`}>
      <legend className="sr-only">Thông tin Tour</legend>
      {(clientError || error) && <Notice tone="danger">{clientError || error}</Notice>}
      <label className="block text-sm">Tên Tour<input required maxLength={150} className={inputClass} value={name} onChange={e => setName(e.target.value)} placeholder="Ví dụ: Tham quan từ xa · Sáng thứ Bảy" /></label>
      <label className="block text-sm">Thời gian dự kiến<input required type="datetime-local" className={inputClass} value={schedule} onChange={e => setSchedule(e.target.value)} />
        <span className="mt-1 block text-xs text-[#64748b]">Giờ theo máy đang dùng. Tới giờ robot không tự chạy; Staff bắt đầu thủ công.</span></label>
      <label className="block text-sm">Mô tả<textarea maxLength={1000} rows={3} className={inputClass} value={description} onChange={e => setDescription(e.target.value)} placeholder="Nội dung ngắn đại diện trường sẽ thấy khi đăng ký." /></label>
      <label className="block text-sm">Tuyến đã kiểm chứng<select title="" required aria-label="Tuyến đã kiểm chứng" className={inputClass} value={routeRevisionId} disabled={routes.isPending} onChange={e => setRouteRevisionId(e.target.value)}>
        <option value="">— Chọn tuyến —</option>
        {routes.data?.map(route => <option key={route.revisionId} value={route.revisionId}>{route.name} · phiên bản {route.revisionNumber} · {route.stops.length} điểm dừng</option>)}
      </select>
        {routes.isError ? <span role="alert" className="mt-1 block text-xs text-[#b23e31]">Không tải được danh mục tuyến.</span>
          : routes.data?.length === 0 ? <span role="status" className="mt-1 block text-xs text-[#b23e31]">Chưa có tuyến nào chạy thử đạt. Gửi kiểm chứng ở Danh mục tuyến và chờ Kỹ thuật ghi kết quả.</span>
          : <span className="mt-1 block text-xs text-[#64748b]">Chỉ hiện tuyến đã gửi kiểm chứng và có kết quả chạy thử đạt.</span>}</label>
      <label className="block text-sm">Robot<select title="" required aria-label="Robot" className={inputClass} value={robotCode} disabled={robots.isPending} onChange={e => setRobotCode(e.target.value)}>
        <option value="">— Chọn robot vật lý —</option>
        {robots.data?.map(robot => <option key={robot.id} value={robot.robotCode}>{robot.displayName ? `${robot.displayName} · ` : ''}{robot.robotCode}</option>)}
      </select>
        {robots.isError ? <span role="alert" className="mt-1 block text-xs text-[#b23e31]">Không tải được danh sách robot.</span>
          : <span className="mt-1 block text-xs text-[#64748b]">Robot được giữ từ 15 phút trước giờ chạy tới 15 phút sau khi kết thúc theo thời gian chạy thử đạt.</span>}</label>
      <label className="block text-sm">Người vận hành<select title="" required aria-label="Người vận hành" className={inputClass} value={operatorUserId} disabled={operators.isPending} onChange={e => setOperatorUserId(e.target.value)}>
        <option value="">— Chọn Staff —</option>
        {operators.data?.map(person => <option key={person.userId} value={person.userId}>{person.fullName} · {person.username}</option>)}
      </select>
        {operators.isError && <span role="alert" className="mt-1 block text-xs text-[#b23e31]">Không tải được danh sách Staff.</span>}</label>
      <label className="block text-sm">Video dự phòng (không bắt buộc)<input type="url" maxLength={1000} className={inputClass} value={video} onChange={e => setVideo(e.target.value)} placeholder="https://…" /></label>
      <div className="flex flex-col-reverse gap-2 border-t border-[#f1f5f9] pt-4 sm:flex-row sm:justify-end">
        <Link to="/staff/manage/tours" className={buttonClass('secondary')}>Hủy bỏ</Link>
        <button type="submit" disabled={busy || !ready} className={buttonClass('primary')}>{busy ? 'Đang lưu…' : 'Tạo Tour'}</button>
      </div>
    </fieldset>

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
  </form>
}
