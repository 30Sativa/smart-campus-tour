import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Pagination, SearchField, panelClass } from '../../../components/ui/ConsolePrimitives'
import { inputClass, rowClass, tdClass, thClass } from '../../../components/ui/ui-classes'
import { CapacityBar } from '../../../components/ui/Charts'
import { AdminErrorPanel, EmptyState, SkeletonRows } from '../AdminUi'
import { formatSlot } from '../admin-format'
import { useDebouncedValue } from '../use-debounced-value'
import { useTours } from './hooks'
import { TOUR_STATE_LABEL, tourError } from './tour-messages'
import type { TourPhase, TourState } from './types'

const PAGE_SIZE = 20
const STATE_TONE: Record<TourState, string> = {
  SCHEDULED: 'border-[#cfe1fb] bg-[#eef5ff] text-[#2f62b8]',
  READY: 'border-[#cde9dc] bg-[#effbf5] text-[#1f7a55]',
  RUNNING: 'border-[#2d719e] bg-[#2d719e] text-white',
  COMPLETED: 'border-[#dbe6f4] bg-[#f6f9fd] text-[#5d7085]',
  CANCELLED: 'border-[#f5c8c2] bg-[#fff1ef] text-[#b23e31]',
}

const TABS: { phase: TourPhase; label: string; sort?: string }[] = [
  { phase: 'UPCOMING', label: 'Sắp diễn ra' },
  { phase: 'RUNNING', label: 'Đang chạy' },
  { phase: 'FINISHED', label: 'Đã kết thúc / Đã hủy', sort: '-scheduledStartAt' },
]

/**
 * Every Tour across time, paged: upcoming, running or finished (`?tab=`), or one
 * state (`?state=`, `ALL` for every state), with search. The list view of the
 * Tour calendar; it changes only its own search params, so the page's own
 * (`view`) stay. A row opens the Tour on the page that fits its state.
 */
export function TourListPanel() {
  const [search, setSearch] = useState('')
  const [params, setParams] = useSearchParams()
  const requestedState = params.get('state')?.toUpperCase()
  // A state or "all" pick steps outside the tabs: it is how dashboard links land, and how to reach a Tour past its start that never ran.
  const state: TourState | '' = requestedState && requestedState in TOUR_STATE_LABEL ? requestedState as TourState : ''
  const everything = requestedState === 'ALL'
  const tab = state || everything ? null : TABS.find(item => item.phase === params.get('tab')) ?? TABS[0]
  const [page, setPage] = useState(1)
  const term = useDebouncedValue(search, 300)
  const tours = useTours({ search: term, state: state || undefined, phase: tab?.phase, sort: tab?.sort, page, size: PAGE_SIZE })
  const update = (key: 'tab' | 'state', value: string) => { setParams(current => { const next = new URLSearchParams(current); next.delete('tab'); next.delete('state'); if (value) next.set(key, value); return next }, { replace: true }); setPage(1) }
  const pickTab = (phase: TourPhase) => update('tab', phase)
  return <>
    <section className={panelClass} aria-label="Danh sách Tour">
      <div className="flex flex-wrap items-center gap-3 border-b border-[#eef1f4] px-3 py-2.5">
        <SearchField value={search} onChange={v => { setSearch(v); setPage(1) }} label="Tìm Tour" placeholder="Tên Tour" />
        <div role="group" aria-label="Nhóm Tour" className="inline-flex flex-wrap gap-0.5 rounded-[10px] bg-[#eef2f6] p-[3px]">
          {TABS.map(item => <button key={item.phase} type="button" aria-pressed={tab?.phase === item.phase} onClick={() => pickTab(item.phase)}
            className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${tab?.phase === item.phase ? 'bg-white text-[#173b59] shadow-[0_1px_2px_rgba(15,23,42,0.08)]' : 'text-[#475569]'}`}>{item.label}</button>)}
        </div>
        <label className="flex items-center gap-2 whitespace-nowrap text-sm">Trạng thái<select aria-label="Trạng thái Tour" className={inputClass} value={everything ? 'ALL' : state} onChange={e => update('state', e.target.value)}>
          <option value="">Theo nhóm đang chọn</option>
          <option value="ALL">Tất cả</option>
          {(Object.keys(TOUR_STATE_LABEL) as TourState[]).map(s => <option key={s} value={s}>{TOUR_STATE_LABEL[s]}</option>)}
        </select></label>
      </div>
      {tours.isError ? <AdminErrorPanel title={tourError(tours.error)} onRetry={() => void tours.refetch()} /> : tours.isPending ? <SkeletonRows rows={4} label="Đang tải danh sách Tour" /> : tours.data.data.length === 0 ?
        <EmptyState title="Chưa có Tour phù hợp" description="Tạo Tour mới từ một tuyến khả dụng hoặc đổi bộ lọc." /> :
        <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left" aria-label="Danh sách Tour">
          <thead className="border-b border-[#e2e8f0]"><tr>{['Tour', 'Thời gian', 'Tuyến', 'Đoàn đăng ký', 'Đã gửi thư mời', 'Trạng thái'].map(label => <th key={label} scope="col" className={thClass}>{label}</th>)}</tr></thead>
          <tbody className="divide-y divide-[#eef1f4]">{tours.data.data.map(tour => <tr key={tour.id} className={rowClass}>
            <td className={tdClass}><Link to={`/staff/tours/${tour.id}`} className="font-semibold text-[#0f172a] hover:text-[#2d719e] hover:underline focus-visible:outline-2 focus-visible:outline-[#2d719e]">{tour.name}</Link></td>
            <td className={`${tdClass} whitespace-nowrap`}>{formatSlot(tour.scheduledStartAt)}</td>
            <td className={tdClass}>{tour.routeName}</td>
            <td className={`${tdClass} tabular-nums`}>{tour.registrationCount} đoàn</td>
            <td className={tdClass}>{tour.registrationCount ? <CapacityBar value={tour.invitationCount} max={tour.registrationCount} unit="đoàn" /> : <span className="text-xs text-[#94a3b8]">chưa có đoàn</span>}</td>
            <td className={tdClass}><span className={`inline-flex rounded-full border px-2 py-px text-[11px] font-bold whitespace-nowrap ${STATE_TONE[tour.state]}`}>{TOUR_STATE_LABEL[tour.state]}</span></td>
          </tr>)}</tbody>
        </table></div>}
      {tours.data && <Pagination page={page} pageCount={Math.max(1, tours.data.pagination.totalPages)} total={tours.data.pagination.totalItems} pageSize={PAGE_SIZE} onPage={setPage} label="Tour" />}
    </section>
  </>
}
