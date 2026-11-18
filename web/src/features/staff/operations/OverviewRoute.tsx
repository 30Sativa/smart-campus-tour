import { Check, MapPin } from 'lucide-react'
import { isTourStale, useOperationTour } from './hooks'

const matchesStop = (stopId: string | undefined, executionId: string | null | undefined) =>
  Boolean(stopId && executionId && stopId.toLowerCase() === executionId.toLowerCase())

/** Show the planned sequence, with progress marks only for a running Tour. */
export function OverviewRoute({ tourId, now, planned = false }: { tourId: string; now: number; planned?: boolean }) {
  const query = useOperationTour(tourId, !planned)
  if (query.isPending) return <p role="status" className="text-xs text-slate-600">Đang tải sơ đồ tuyến…</p>
  if (!query.data) return <div className="text-xs text-slate-700">
    <p>Không tải được sơ đồ tuyến.</p>
    <button type="button" onClick={() => void query.refetch()} disabled={query.isFetching}
      className="mt-1 min-h-8 rounded-sm font-semibold text-sky-800 underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-sky-800 disabled:cursor-not-allowed disabled:opacity-60">
      Thử lại
    </button>
  </div>

  const { tour, routeRevision } = query.data
  const matchesMode = planned ? tour.state === 'SCHEDULED' || tour.state === 'READY' : tour.state === 'RUNNING'
  if (!matchesMode) return <p className="text-xs text-slate-600">Tour đã đổi trạng thái.</p>
  const execution = planned ? null : query.data.execution
  const stops = routeRevision?.stops.toSorted((a, b) => a.stopOrder - b.stopOrder) ?? []
  if (!stops.length) return <p className="text-xs text-slate-600">Tour chưa có sơ đồ điểm dừng.</p>

  const step = execution?.currentStep
  const current = step === 'OBSERVING' || step === 'NAVIGATING'
    ? stops.findIndex(stop => matchesStop(stop.id, execution?.currentRevisionStopId)) : -1
  const next = step === 'INITIALIZING' ? 0 : current >= 0 ? current + 1 : -1
  const currentLabel = step === 'OBSERVING' ? 'Đang dừng'
    : execution?.operationalStatus === 'PAUSED' ? 'Đang tạm dừng'
    : 'Điểm đích hiện tại'
  const stale = !planned && isTourStale(query, now)

  return <div className="min-w-0">
    <div tabIndex={0} role="region" aria-label="Sơ đồ tuyến theo thứ tự điểm dừng"
      className="overflow-x-auto rounded-sm p-1 focus-visible:outline-2 focus-visible:outline-sky-800">
      <ol className="flex min-w-full w-max justify-center">
        {stops.map((stop, index) => {
          const active = index === current
          // A stop earlier in the route may have been skipped. Mark only the last confirmed arrival.
          const arrived = !active && matchesStop(stop.id, execution?.lastArrivedRevisionStopId)
          const label = active ? currentLabel : arrived ? 'Đã đến' : index === next ? 'Điểm kế tiếp' : null
          const marker = active ? 'border-sky-800 bg-sky-800 text-white'
            : arrived ? 'border-sky-700 bg-white text-sky-800' : 'border-slate-500 bg-white text-slate-600'
          return <li key={stop.id ?? `${stop.stopOrder}-${stop.poiRevisionId}`} aria-current={active ? 'step' : undefined}
            className="relative isolate flex min-w-20 max-w-32 flex-1 flex-col items-center gap-1.5 px-1 text-center text-xs sm:min-w-24">
            {index < stops.length - 1 && <span aria-hidden="true" className="absolute top-3.5 -right-1/2 left-1/2 -z-10 h-px bg-sky-300" />}
            <span aria-hidden="true" className={`grid size-7 place-items-center rounded-full border font-semibold tabular-nums ${marker}`}>
              {active ? <MapPin size={14} /> : arrived ? <Check size={15} /> : stop.stopOrder}
            </span>
            <span className="max-w-full break-words font-semibold text-slate-900">{stop.name}</span>
            {label && <span className="text-[11px] text-slate-600">{label}</span>}
          </li>
        })}
      </ol>
    </div>
    {stale && <p className="mt-1 text-center text-[11px] text-amber-800">Tiến độ có thể đã cũ. Đang thử cập nhật.</p>}
    {step === 'RETURNING_TO_END' && <p className="mt-1 text-center text-[11px] text-slate-600">Đang về điểm kết thúc.</p>}
  </div>
}
