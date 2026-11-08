import { useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { Link } from 'react-router'
import { LoadingPanel, PanelHead, panelClass } from '../../components/ui/ConsolePrimitives'
import { buttonClass } from '../../components/ui/ui-classes'
import { formatSlot } from '../administration/admin-format'
import { needsStaffWork, poiStatus } from '../administration/pois/poi-status'
import { Waited } from '../administration/registrations/components/Waited'
import { useRegistrationReviews } from '../administration/registrations/hooks'
import { useTours } from '../administration/tours/hooks'
import type { TourBlocker } from '../administration/tours/types'
import { useReviewParam } from '../administration/use-review-param'
import { usePoiProposals } from '../technical/technical-hooks'

const PREVIEW = 5

/**
 * The preparation work waiting on Staff, oldest deadline first: registrations to
 * decide, Tours not READY yet, POIs to finish. Every total is the API's own
 * (pagination metadata or the full list), never the preview's row count, and a
 * section that failed to load says so instead of showing zero.
 *
 * While something needs a person now (`urgent`), the queue folds to one line so
 * the incident stays the first thing on the page; it can still be opened.
 */
export function WorkQueue({ urgent }: { urgent: boolean }) {
  const registrations = useRegistrationReviews({ state: 'SUBMITTED', page: 1, size: PREVIEW, sort: 'submittedAt' })
  // `readyBlockers`: the server says why each previewed Tour cannot be marked READY yet (same checks as its detail).
  const scheduled = useTours({ state: 'SCHEDULED', page: 1, size: PREVIEW, sort: 'scheduledStartAt', readyBlockers: true })
  const pois = usePoiProposals()
  const { open: openReview } = useReviewParam()
  const [toggled, setToggled] = useState<boolean | null>(null)
  const open = toggled ?? !urgent

  const pending = registrations.isSuccess ? registrations.data.pagination.totalItems : null
  const notReady = scheduled.isSuccess ? scheduled.data.pagination.totalItems : null
  const poiWork = pois.isSuccess ? pois.data.filter(needsStaffWork).length : null
  const poiWaiting = pois.isSuccess ? pois.data.filter(p => poiStatus(p) === 'WAIT').length : null
  const figure = (value: number | null) => value ?? '-'

  return (
    <section className={panelClass} aria-label="Hàng chờ chuẩn bị">
      <PanelHead title="Hàng chờ chuẩn bị" description="Việc cần Staff xử lý trước khi Tour diễn ra."
        action={<button type="button" aria-expanded={open} onClick={() => setToggled(!open)} className={buttonClass('ghost', 'sm')}>
          {open ? 'Thu gọn' : 'Mở'}<ChevronDown size={14} aria-hidden="true" className={`transition-transform motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} />
        </button>} />
      {!open ? <p className="px-3.5 py-3 text-[13px] text-[#475569]">
        {urgent && <span className="block font-semibold text-[#9d3428]">Đang có việc cần xử lý ngay ở trên. Hàng chờ tạm thu gọn.</span>}
        {figure(pending)} đăng ký chờ duyệt · {figure(notReady)} Tour chưa chốt · {figure(poiWork)} POI cần hoàn thiện
      </p> : <div className="divide-y divide-[#eef1f4]">
        <QueueSection title="Đăng ký chờ duyệt" total={pending} failed={registrations.isError} loading={registrations.isPending} onRetry={() => void registrations.refetch()}
          note="Gửi trước hiện trước. Mục tiêu xử lý trong 2 ngày làm việc; thời gian chờ tính theo ngày lịch."
          more={<Link to="/staff/manage/registrations/pending" className={buttonClass('ghost', 'sm')}>Mở hàng chờ</Link>}>
          {registrations.data?.data.map(reg => <li key={reg.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
            <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-semibold text-[#0f172a]">{reg.groupName}</span><span className="block truncate text-xs text-[#64748b]">{reg.schoolName} · {reg.tourName}</span></span>
            <Waited since={reg.submittedAt} />
            <button type="button" onClick={() => openReview(reg.id)} className={buttonClass('secondary', 'sm')}>Xem & duyệt<span className="sr-only"> {reg.groupName}</span></button>
          </li>)}
        </QueueSection>

        <QueueSection title="Tour chưa chốt" total={notReady} failed={scheduled.isError} loading={scheduled.isPending} onRetry={() => void scheduled.refetch()}
          note="Tour chưa chốt, cần chốt trước giờ bắt đầu."
          more={<Link to="/staff/schedule?view=list&state=SCHEDULED" className={buttonClass('ghost', 'sm')}>Tất cả</Link>}>
          {scheduled.data?.data.map(tour => <li key={tour.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold text-[#0f172a]">{tour.name}</span>
              <span className="block truncate text-xs text-[#64748b]">{formatSlot(tour.scheduledStartAt)} · {tour.registrationCount} đoàn</span>
              <ReadyVerdict blockers={tour.readyBlockers} />
            </span>
            <Link to={`/staff/manage/tours/${tour.id}`} className={buttonClass('secondary', 'sm')}>Chuẩn bị và chốt<span className="sr-only"> {tour.name}</span></Link>
          </li>)}
        </QueueSection>

        <QueueSection title="POI cần hoàn thiện" total={poiWork} failed={pois.isError} loading={pois.isPending} onRetry={() => void pois.refetch()}
          note={poiWaiting ? `Bản nháp và cần sửa, mọi bản đồ. ${poiWaiting} POI khác đang chờ kỹ thuật kiểm tra, Staff không cần làm gì.` : 'Bản nháp và cần sửa, mọi bản đồ.'}
          more={<Link to="/staff/manage/pois" className={buttonClass('ghost', 'sm')}>Mở POI</Link>} />
      </div>}
    </section>
  )
}

/**
 * Why a Tour cannot be marked READY yet, in the server's words: the first blocker and how many more. Nothing when
 * the server did not say (an older server, or a row that is not SCHEDULED); "can be marked" only on an empty list.
 */
function ReadyVerdict({ blockers }: { blockers?: TourBlocker[] | null }) {
  if (!blockers) return null
  if (blockers.length === 0) return <span className="mt-0.5 block text-xs font-semibold text-[#15803d]">Đủ điều kiện chốt.</span>
  return <span className="mt-0.5 block text-xs font-semibold text-[#8a5a06]" title={blockers.map(b => b.message).join('\n')}>
    {blockers[0].message}{blockers.length > 1 ? ` (và ${blockers.length - 1} điều kiện khác)` : ''}
  </span>
}

function QueueSection({ title, total, failed, loading, onRetry, note, more, children }: {
  title: string; total: number | null; failed: boolean; loading: boolean; onRetry: () => void; note: string; more: ReactNode; children?: ReactNode
}) {
  return (
    <div className="px-3.5 py-3" role="group" aria-label={title}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[13.5px] font-semibold text-[#0f172a]">{title} <span className="ml-1 rounded-full bg-[#f1f5f9] px-2 py-px text-xs tabular-nums text-[#334155]">{total ?? '-'}</span></h3>
        {more}
      </div>
      <p className="mt-0.5 text-xs text-[#64748b]">{note}</p>
      {failed ? <p role="alert" className="mt-2 text-xs font-semibold text-[#9d3428]">Không tải được. <button type="button" onClick={onRetry} className="underline">Thử lại</button></p>
        : loading ? <div className="mt-2"><LoadingPanel /></div>
        : children && total ? <ul className="mt-1 divide-y divide-[#f1f5f9]">{children}</ul>
        : children ? <p className="mt-2 text-xs text-[#64748b]">Không có mục nào.</p> : null}
    </div>
  )
}
