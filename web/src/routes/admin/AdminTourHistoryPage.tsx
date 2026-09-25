import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import type { AdminTour } from '../../api/contracts/admin'
import { FilterChips, PageHeader, Pagination, panelClass } from '../../features/staff/StaffUi'
import { usePagination } from '../../features/staff/use-pagination'
import { AdminErrorPanel, AdminPage, EmptyState, SkeletonRows, TableFrame, TourStateBadge } from '../../features/administration/AdminUi'
import { useAdminTours } from '../../features/administration/admin-hooks'
import { formatSlot, formatStamp } from '../../features/administration/admin-format'
import { rowClass, tdClass, thClass } from '../../features/administration/admin-classes'

type Filter = 'all' | 'Completed' | 'Cancelled'

/**
 * Finished Tours, read-only: when they ran, how they ended and why (scope
 * §6.2 StartedAt / EndedAt / EndReason). A Tour is never re-opened after it ran.
 */
export default function AdminTourHistoryPage() {
  const tours = useAdminTours()
  const [filter, setFilter] = useState<Filter>('all')
  const finished = useMemo(() => (tours.data ?? []).filter((tour) => tour.state === 'Completed' || tour.state === 'Cancelled'), [tours.data])
  const rows = filter === 'all' ? finished : finished.filter((tour) => tour.state === filter)
  const paged = usePagination(rows, 10, filter)

  return (
    <AdminPage>
      <PageHeader eyebrow="Lịch sử" title="Lịch sử Tour" description="Tour đã hoàn thành hoặc đã hủy. Chỉ xem; muốn chạy lại thì tạo Tour mới." />
      <section className={panelClass} aria-label="Lịch sử Tour">
        <div className="border-b border-[#efefe9] p-4">
          <FilterChips<Filter>
            label="Lọc theo kết quả"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: 'Tất cả', count: tours.data ? finished.length : undefined },
              { value: 'Completed', label: 'Hoàn thành', count: tours.data ? finished.filter((t) => t.state === 'Completed').length : undefined },
              { value: 'Cancelled', label: 'Đã hủy', count: tours.data ? finished.filter((t) => t.state === 'Cancelled').length : undefined },
            ]}
          />
        </div>
        {tours.isError ? (
          <div className="p-5"><AdminErrorPanel title="Không thể tải danh sách Tour." onRetry={() => void tours.refetch()} /></div>
        ) : tours.isLoading ? (
          <SkeletonRows rows={6} label="Đang tải lịch sử" />
        ) : rows.length === 0 ? (
          <EmptyState title="Chưa có Tour nào kết thúc." />
        ) : (
          <>
            <HistoryTable tours={paged.rows} />
            <Pagination page={paged.page} pageCount={paged.pageCount} total={paged.total} pageSize={paged.pageSize} onPage={paged.setPage} label="Phân trang lịch sử Tour" />
          </>
        )}
      </section>
    </AdminPage>
  )
}

function HistoryTable({ tours }: { tours: AdminTour[] }) {
  return (
    <>
      <TableFrame label="Lịch sử Tour">
        <thead className="border-b border-[#efefe9] bg-[#f7f7f3]">
          <tr>
            <th scope="col" className={thClass}>Tour</th>
            <th scope="col" className={thClass}>Dự kiến</th>
            <th scope="col" className={thClass}>Bắt đầu</th>
            <th scope="col" className={thClass}>Kết thúc</th>
            <th scope="col" className={`${thClass} text-right`}>Đoàn</th>
            <th scope="col" className={thClass}>Kết quả</th>
            <th scope="col" className={thClass}>Lý do kết thúc</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#efefe9]">
          {tours.map((tour) => (
            <tr key={tour.id} className={rowClass}>
              <td className={tdClass}>
                <Link to={`/admin/tours/${tour.id}`} className="font-semibold text-[#1c1c1c] hover:text-[#4d6410] hover:underline">{tour.name}</Link>
                <p className="text-xs text-[#8e9096]">{tour.code} · {tour.routeName}</p>
              </td>
              <td className={`${tdClass} whitespace-nowrap text-[13px] text-[#3a3d44]`}>{formatSlot(tour.scheduledAt)}</td>
              <td className={`${tdClass} whitespace-nowrap text-[13px] text-[#3a3d44]`}>{formatStamp(tour.startedAt)}</td>
              <td className={`${tdClass} whitespace-nowrap text-[13px] text-[#3a3d44]`}>{formatStamp(tour.endedAt)}</td>
              <td className={`${tdClass} text-right tabular-nums`}>{tour.counts.approved}</td>
              <td className={tdClass}><TourStateBadge state={tour.state} /></td>
              <td className={`${tdClass} max-w-80 text-[13px] leading-5 text-[#4a4f59]`}>{tour.endReason ?? '-'}</td>
            </tr>
          ))}
        </tbody>
      </TableFrame>
      <ul className="divide-y divide-[#efefe9] md:hidden" aria-label="Lịch sử Tour">
        {tours.map((tour) => (
          <li key={tour.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <Link to={`/admin/tours/${tour.id}`} className="font-bold text-[#1c1c1c]">{tour.name}</Link>
              <TourStateBadge state={tour.state} />
            </div>
            <p className="mt-1 text-xs text-[#8e9096]">{tour.code} · {formatSlot(tour.scheduledAt)}</p>
            <p className="mt-2 text-[13px] text-[#3a3d44]">{formatStamp(tour.startedAt)} → {formatStamp(tour.endedAt)}</p>
            {tour.endReason && <p className="mt-1 text-[13px] leading-5 text-[#4a4f59]">{tour.endReason}</p>}
          </li>
        ))}
      </ul>
    </>
  )
}
