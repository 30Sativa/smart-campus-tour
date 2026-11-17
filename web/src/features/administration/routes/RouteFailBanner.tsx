import type { ReactNode } from 'react'
import { CircleAlert } from 'lucide-react'
import { campusShortStamp } from '../tours/tour-calendar'
import { appliedFail, failedCheckNames, resultSource } from './route-messages'
import type { VersionedRoute } from './versioned-api'

/**
 * While the result in effect is Không đạt: why, which checks failed, the robot, who went with it, who recorded it and
 * when, like the POI fail banner. A FAIL recorded on another save with the same path says which save it came from.
 * `nextStep` says what to do in words, so the page keeps one "Sửa tuyến" button (its header).
 */
export function RouteFailBanner({ route, action, nextStep }: { route: VersionedRoute; action?: ReactNode; nextStep?: string }) {
  const run = appliedFail(route)
  if (!run) return null
  const failed = failedCheckNames(run)
  const source = resultSource(route)
  const people = [run.participatingStaffName && `Staff đi cùng ${run.participatingStaffName}`, run.checkedByName && `ghi bởi ${run.checkedByName}`]
    .filter(Boolean).join(' · ')
  return <section aria-label="Kết quả chạy thử không đạt" className="rounded-[15px] border border-[#f1c9c3] bg-[#fbeeec] px-5 py-3.5 text-sm text-[#7f2f27]">
    <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
      <div className="min-w-0 flex-1 space-y-1">
        <p className="flex items-center gap-2 font-semibold"><CircleAlert size={16} aria-hidden="true" className="shrink-0" />Kỹ thuật ghi chạy thử không đạt</p>
        <p>Lý do: {run.failureReason?.trim() || 'Không ghi lý do.'}</p>
        {failed.length > 0 && <div>
          <p>Không đạt ở:</p>
          <ul aria-label="Mục không đạt" className="ml-5 list-disc">{failed.map(item => <li key={item}>{item}</li>)}</ul>
        </div>}
        <p className="text-xs text-[#a4473d]">Robot {run.robotCode}{people && ` · ${people}`} · ghi lúc {campusShortStamp(run.checkedAt)}</p>
        {source && <p className="text-xs text-[#a4473d]">Lần chạy này ghi trên bản lưu {campusShortStamp(source.createdAt)}, cùng đường đi nên áp dụng cho bản này.</p>}
        {nextStep && <p className="font-medium">{nextStep}</p>}
      </div>
      {action}
    </div>
  </section>
}
