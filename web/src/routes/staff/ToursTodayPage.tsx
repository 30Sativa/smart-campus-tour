import { useState, useMemo } from 'react'
import { useSearchParams } from 'react-router'
import { Search } from 'lucide-react'
import type { TourOperation, TourState } from '../../api/contracts/staff'
import { useTours } from '../../features/staff/staff-hooks'
import { EmptyPanel, ErrorPanel, StaffPage } from '../../features/staff/StaffUi'
import { LoadingPanel, PageHeader, panelClass } from '../../components/ui/ConsolePrimitives'
import { StageHint, StageTabs } from '../../components/ui/StageTabs'
import { TourTable } from '../../features/staff/components/TourParts'
import { groupSummary } from '../../features/staff/attention'
import { useNow } from '../../features/staff/use-now'

/** The day as a flow: waiting for Admin › Ready › Running › Completed, then Cancelled. */
const STAGES: Array<{ key: TourState; label: string; color: string; note: string }> = [
  { key: 'Scheduled', label: 'Chờ Admin chốt', color: '#94a3b8', note: 'Staff chưa cần làm gì' },
  { key: 'Ready', label: 'Sẵn sàng', color: '#4d93bd', note: 'Kiểm tra thiết bị rồi bắt đầu' },
  { key: 'Running', label: 'Đang chạy', color: '#2563eb', note: 'Staff điều hành' },
  { key: 'Completed', label: 'Hoàn thành', color: '#16a34a', note: 'Chỉ xem nhật ký' },
  { key: 'Cancelled', label: 'Đã hủy', color: '#dc2626', note: 'Chỉ xem nhật ký' },
]
const STATES = STAGES.map((stage) => stage.key)

/** With no choice in the URL: what is running, else what can start, else what waits, else the record. */
function defaultView(tours: TourOperation[] | undefined): TourState {
  const has = (state: TourState) => tours?.some((tour) => tour.state === state)
  return (['Running', 'Ready', 'Scheduled', 'Completed'] as TourState[]).find(has) ?? 'Running'
}

/**
 * Today's sessions, one state at a time. Staff sees each session with its
 * groups and the one next step: check & start a Ready one, run a Running one,
 * read the log of a finished one.
 */
export default function ToursTodayPage() {
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const tours = useTours()
  const now = useNow(30_000)
  const asked = params.get('view')
  const view: TourState = asked === 'ended' ? 'Completed' : asked && STATES.includes(asked as TourState) ? (asked as TourState) : defaultView(tours.data)
  const stage = STAGES.find((item) => item.key === view) ?? STAGES[2]

  const setView = (next: TourState) =>
    setParams((current) => {
      current.set('view', next)
      return current
    })

  const inView = useMemo(() => tours.data?.filter((tour) => tour.state === view) ?? [], [tours.data, view])
  const rows = useMemo(() => {
    if (!search.trim()) return inView
    const query = search.trim().toLowerCase()
    return inView.filter(
      (t) =>
        t.name.toLowerCase().includes(query) ||
        t.code.toLowerCase().includes(query) ||
        t.routeName.toLowerCase().includes(query) ||
        t.registrations.some((r) => r.schoolName.toLowerCase().includes(query)),
    )
  }, [inView, search])

  return (
    <StaffPage>
      <PageHeader
        eyebrow="Quản lý Tour"
        title="Buổi hôm nay"
        description="Theo dõi danh sách các buổi tham quan trong ngày. Nhân viên vận hành kiểm tra thiết bị và bắt đầu khi buổi ở trạng thái Sẵn sàng."
      />
      <section className={panelClass} aria-label="Danh sách buổi hôm nay">
        <div className="flex flex-col gap-3 border-b border-[#f1f2f4] px-3.5 py-2.5 lg:flex-row lg:items-center lg:justify-between">
          <StageTabs<TourState>
            label="Lọc buổi theo trạng thái"
            value={view}
            onChange={setView}
            stages={STAGES.map((item) => ({ key: item.key, label: item.label, color: item.color, count: tours.data?.filter((tour) => tour.state === item.key).length, separated: item.key === 'Cancelled' }))}
          />
          <div className="relative w-full lg:w-64">
            <Search size={14} className="absolute top-1/2 left-3 -translate-y-1/2 text-[#94a3b8]" aria-hidden="true" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm theo mã, tên, đoàn…"
              aria-label="Tìm kiếm buổi hôm nay"
              className="h-9 w-full rounded-lg border border-[#e5e7eb] bg-white pr-3 pl-8 text-xs text-[#0f172a] outline-none transition-all placeholder:text-[#94a3b8] focus:border-[#5b9dc9] focus:ring-2 focus:ring-[#5b9dc9]/20"
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
        ) : (
          <>
            <StageHint color={stage.color} title={stage.label} count={`${inView.length} buổi · ${inView.reduce((sum, tour) => sum + groupSummary(tour).students, 0)} học sinh`} note={stage.note} />
            {rows.length === 0 ? (
              <div className="p-5">
                <EmptyPanel>
                  {search.trim() ? 'Không tìm thấy buổi nào phù hợp từ khóa.' : `Không có buổi nào ở trạng thái “${stage.label}”.`}
                </EmptyPanel>
              </div>
            ) : (
              <TourTable tours={rows} now={now} label="Buổi hôm nay" />
            )}
          </>
        )}
      </section>
    </StaffPage>
  )
}
