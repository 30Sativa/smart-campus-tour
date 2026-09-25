import { useState, useMemo } from 'react'
import { useSearchParams } from 'react-router'
import { Search } from 'lucide-react'
import type { TourOperation, TourState } from '../../api/contracts/staff'
import { useTours } from '../../features/staff/staff-hooks'
import { EmptyPanel, ErrorPanel, FilterChips, LoadingPanel, PageHeader, panelClass, StaffPage } from '../../features/staff/StaffUi'
import { TourTable } from '../../features/staff/components/TourParts'
import { useNow } from '../../features/staff/use-now'

type View = 'all' | 'Running' | 'Ready' | 'Scheduled' | 'ended'

const VIEWS: Record<View, { label: string; states: TourState[] | null }> = {
  all: { label: 'Tất cả', states: null },
  Running: { label: 'Đang chạy', states: ['Running'] },
  Ready: { label: 'Sẵn sàng', states: ['Ready'] },
  Scheduled: { label: 'Chờ Admin chốt', states: ['Scheduled'] },
  ended: { label: 'Đã kết thúc', states: ['Completed', 'Cancelled'] },
}

const matches = (view: View) => (tour: TourOperation) => VIEWS[view].states?.includes(tour.state) ?? true

/**
 * Today's sessions. Staff sees each session with its groups and the one next step:
 * check & start a Ready one, run a Running one, read the log of a finished one.
 */
export default function ToursTodayPage() {
  const [params, setParams] = useSearchParams()
  const view = (params.get('view') as View | null) ?? 'all'
  const [search, setSearch] = useState('')
  const tours = useTours()
  const now = useNow(30_000)

  const setView = (next: View) =>
    setParams((current) => {
      if (next === 'all') current.delete('view')
      else current.set('view', next)
      return current
    })

  const rows = useMemo(() => {
    const base = tours.data?.filter(matches(view)) ?? []
    if (!search.trim()) return base
    const query = search.trim().toLowerCase()
    return base.filter(
      (t) =>
        t.name.toLowerCase().includes(query) ||
        t.code.toLowerCase().includes(query) ||
        t.routeName.toLowerCase().includes(query) ||
        t.registrations.some((r) => r.schoolName.toLowerCase().includes(query)),
    )
  }, [tours.data, view, search])

  return (
    <StaffPage>
      <PageHeader
        eyebrow="Quản lý Tour"
        title="Buổi hôm nay"
        description="Theo dõi danh sách các buổi tham quan trong ngày. Nhân viên vận hành kiểm tra thiết bị và bắt đầu khi buổi ở trạng thái Sẵn sàng."
      />
      <section className={panelClass} aria-label="Danh sách buổi hôm nay">
        <div className="flex flex-col gap-3 border-b border-[#efefe9] px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
          <FilterChips
            label="Lọc theo trạng thái"
            value={view}
            onChange={setView}
            options={(Object.keys(VIEWS) as View[]).map((key) => ({
              value: key,
              label: VIEWS[key].label,
              count: tours.data?.filter(matches(key)).length,
            }))}
          />

          <div className="relative w-full sm:w-64">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8e9096]" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm theo mã, tên, đoàn…"
              aria-label="Tìm kiếm buổi hôm nay"
              className="w-full rounded-lg border border-[#e3e3dc] bg-[#f7f7f3] py-1.5 pl-8 pr-3 text-xs text-[#1c1c1c] outline-none placeholder:text-[#8e9096] focus:border-[#1c1c1c] focus:bg-white transition-all"
            />
          </div>
        </div>

        {tours.isPending ? (
          <div className="p-5">
            <LoadingPanel />
          </div>
        ) : tours.isError ? (
          <div className="p-5">
            <ErrorPanel error={tours.error} onRetry={tours.refetch} />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-5">
            <EmptyPanel>
              {search.trim() ? 'Không tìm thấy buổi nào phù hợp từ khóa.' : 'Không có buổi nào ở nhóm này.'}
            </EmptyPanel>
          </div>
        ) : (
          <TourTable tours={rows} now={now} label="Buổi hôm nay" />
        )}
      </section>
    </StaffPage>
  )
}
