import { useState } from 'react'
import { Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { FilterChips, LoadingPanel, PageHeader, Pagination, SearchField, panelClass } from '../../components/ui/ConsolePrimitives'
import { KpiRow, KpiTile } from '../../components/ui/Charts'
import { rowClass, tdClass, thClass } from '../../components/ui/ui-classes'
import { formatSlot } from '../../features/administration/admin-format'
import { toursApi } from '../../features/administration/tours/api/tours'
import { tourKeys, useTours } from '../../features/administration/tours/hooks'
import { TOUR_STATE_LABEL, tourError } from '../../features/administration/tours/tour-messages'
import { useDebouncedValue } from '../../features/administration/use-debounced-value'
import { EmptyPanel, ErrorPanel, StaffPage } from '../../features/staff/StaffUi'

const PAGE_SIZE = 20
type Finished = 'COMPLETED' | 'CANCELLED'

/** Tours that have finished or were cancelled, from the live Tour list. Read-only. */
export default function TourHistoryPage() {
  // Null until a tab is clicked: then the first tab that has Tours opens, so a page with history never opens empty.
  const [picked, setPicked] = useState<Finished | null>(null)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const term = useDebouncedValue(search, 300)
  const total = (finished: Finished) => ({ queryKey: [...tourKeys.all, 'history-total', finished], queryFn: () => toursApi.list({ state: finished, page: 1, size: 1 }) })
  const completedTotal = useQuery(total('COMPLETED'))
  const cancelledTotal = useQuery(total('CANCELLED'))
  const completed = completedTotal.data?.pagination.totalItems
  const cancelled = cancelledTotal.data?.pagination.totalItems
  const state: Finished = picked ?? (completed === 0 && cancelled ? 'CANCELLED' : 'COMPLETED')
  const choosing = picked === null && (completedTotal.isPending || cancelledTotal.isPending)
  const tours = useTours({ search: term, state, sort: '-scheduledStartAt', page, size: PAGE_SIZE })

  return (
    <StaffPage>
      <PageHeader eyebrow="Lịch sử" title="Lịch sử Tour" description="Các buổi đã kết thúc hoặc đã hủy. Mở một buổi để xem chi tiết." />

      <KpiRow label="Tổng hợp lịch sử">
        <KpiTile label="Đã kết thúc" value={completed ?? '-'} />
        <KpiTile label="Đã hủy" value={cancelled ?? '-'} tone={cancelled ? 'danger' : 'plain'} />
      </KpiRow>

      <section className={`${panelClass} mt-4`} aria-label="Lịch sử Tour">
        <div className="flex flex-col gap-3 border-b border-[#f1f5f9] px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between">
          <FilterChips label="Kết quả buổi" value={state} onChange={value => { setPicked(value as Finished); setPage(1) }}
            options={[{ value: 'COMPLETED', label: TOUR_STATE_LABEL.COMPLETED }, { value: 'CANCELLED', label: TOUR_STATE_LABEL.CANCELLED }]} />
          <SearchField value={search} onChange={value => { setSearch(value); setPage(1) }} label="Tìm kiếm lịch sử" placeholder="Tìm theo tên buổi hoặc tuyến" />
        </div>
        {tours.isPending || choosing ? <div className="p-4"><LoadingPanel /></div>
          : tours.isError ? <div className="p-4"><ErrorPanel error={new Error(tourError(tours.error))} onRetry={() => void tours.refetch()} /></div>
          : tours.data.data.length === 0 ? <div className="p-4"><EmptyPanel>{term.trim() ? 'Không tìm thấy tour nào phù hợp với từ khóa.' : 'Chưa có tour nào trong lịch sử.'}</EmptyPanel></div>
          : <>
            <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left" aria-label="Lịch sử Tour">
              <thead className="border-b border-[#e2e8f0]"><tr>{['Tour', 'Thời gian', 'Tuyến', 'Đoàn đăng ký'].map(label => <th key={label} scope="col" className={thClass}>{label}</th>)}</tr></thead>
              <tbody className="divide-y divide-[#eef1f4]">{tours.data.data.map(tour => <tr key={tour.id} className={rowClass}>
                <td className={tdClass}><Link to={`/staff/manage/tours/${tour.id}`} className="font-semibold text-[#0f172a] hover:text-[#2d719e] hover:underline">{tour.name}</Link></td>
                <td className={`${tdClass} whitespace-nowrap`}>{formatSlot(tour.scheduledStartAt)}</td>
                <td className={tdClass}>{tour.routeName}</td>
                <td className={`${tdClass} tabular-nums`}>{tour.registrationCount} đoàn</td>
              </tr>)}</tbody>
            </table></div>
            <Pagination page={page} pageCount={Math.max(1, tours.data.pagination.totalPages)} total={tours.data.pagination.totalItems} pageSize={PAGE_SIZE} onPage={setPage} label="Phân trang lịch sử" />
          </>}
      </section>
    </StaffPage>
  )
}
