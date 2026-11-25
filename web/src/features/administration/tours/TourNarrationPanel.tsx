import { useState } from 'react'
import { panelClass } from '../../../components/ui/ConsolePrimitives'
import { ConfirmationDialog } from '../../../components/ui/ConfirmationDialog'
import { notify } from '../../../components/ui/toast-store'
import { buttonClass } from '../../../components/ui/ui-classes'
import { Notice } from '../AdminUi'
import { newRequestId, useRefreshTourNarration, useTourNarration } from './hooks'
import { narrationError } from './tour-messages'
import type { TourDetails } from './types'

/**
 * ADR-0067. A Tour says the narration snapshotted when its route revision was saved (ADR-0060). Before Start, when a
 * POI has newer approved narration and the route still has the Tour's exact path, Staff moves the Tour to it here,
 * without cancelling. The test run, robot hold, registrations and state stay as they are.
 */
export function TourNarrationPanel({ detail }: { detail: TourDetails }) {
  const { tour, routeRevision } = detail
  const upcoming = tour.state === 'SCHEDULED' || tour.state === 'READY'
  const status = useTourNarration(tour.id, upcoming && Boolean(routeRevision))
  const refresh = useRefreshTourNarration()
  const [confirming, setConfirming] = useState(false)
  const [requestId, setRequestId] = useState(newRequestId)
  if (!upcoming || !routeRevision) return null

  // Only an answer with a stop list says anything; an older server or an odd reply must not take the Tour page down.
  const data = Array.isArray(status.data?.stops) ? status.data : undefined
  const newer = data?.stops.filter(stop => stop.hasNewer) ?? []
  const confirm = async () => {
    try {
      const result = await refresh.mutateAsync({ id: tour.id, requestId, rowVersion: tour.rowVersion })
      setConfirming(false)
      setRequestId(newRequestId())
      notify({ title: `Đã cập nhật lời thuyết minh cho ${result.updatedStops.length || newer.length} điểm dừng`,
        detail: `Tour dùng bản tuyến số ${result.routeRevisionNumber}. Học sinh và nhân vật trong kính sẽ nghe lời mới.` })
    } catch { /* The dialog shows the error. */ }
  }

  return <section className={`${panelClass} mt-3 space-y-3 p-4`} aria-label="Lời thuyết minh của Tour">
    <h2 className="text-[15px] font-semibold">Lời thuyết minh</h2>
    {status.isPending && <p className="text-sm text-muted">Đang kiểm tra lời thuyết minh…</p>}
    {status.isError && <Notice tone="danger">{narrationError(status.error)}</Notice>}
    {data && newer.length === 0 && <p className="text-sm text-muted">Tour đang dùng lời thuyết minh đã duyệt mới nhất của mọi điểm dừng.</p>}
    {data && newer.length > 0 && <>
      <Notice tone="warn" action={data.canRefresh ? <button type="button" className={buttonClass('primary', 'sm')}
        onClick={() => { refresh.reset(); setConfirming(true) }}>Cập nhật lời thuyết minh mới</button> : undefined}>
        {newer.length} điểm dừng có lời thuyết minh mới đã duyệt mà Tour chưa dùng: {newer.map(stop => stop.name).join(', ')}.
        {' '}{data.canRefresh ? 'Học sinh và nhân vật trong kính vẫn nghe lời cũ cho tới khi bạn cập nhật.' : data.blockedReason}
      </Notice>
      <ul className="divide-y divide-[#e2e8f0]">{newer.map(stop => <li key={stop.stopId} className="py-2 text-sm">
        <details>
          <summary className="cursor-pointer font-medium">{stop.stopOrder}. {stop.name} <span className="text-xs font-normal text-muted">· có bản mới{stop.approvedRevisionNumber ? ` (bản ${stop.approvedRevisionNumber})` : ''}</span></summary>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <div><p className="text-xs text-muted">Tour đang dùng</p><p className="mt-1 whitespace-pre-line">{stop.currentText || '(trống)'}</p></div>
            <div><p className="text-xs text-muted">Bản mới đã duyệt</p><p className="mt-1 whitespace-pre-line">{stop.approvedText}</p></div>
          </div>
        </details>
      </li>)}</ul>
    </>}
    <ConfirmationDialog open={confirming} title="Cập nhật lời thuyết minh mới?" confirmLabel="Cập nhật" busyLabel="Đang cập nhật…" withReason={false}
      description="Tour chuyển sang một bản của tuyến có cùng đường đi và lời thuyết minh đã duyệt mới nhất (hệ thống tự lưu và gửi bản này nếu chưa có). Kết quả chạy thử, robot đã giữ, các đoàn đăng ký và trạng thái Tour giữ nguyên."
      busy={refresh.isPending} error={refresh.isError ? narrationError(refresh.error) : null}
      onCancel={() => { if (!refresh.isPending) setConfirming(false) }} onConfirm={() => void confirm()} />
  </section>
}
