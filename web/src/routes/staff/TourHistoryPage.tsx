import { useState, useMemo } from 'react'
import { CalendarCheck, History, Search } from 'lucide-react'
import { useTours } from '../../features/staff/staff-hooks'
import { EmptyPanel, ErrorPanel, LoadingPanel, PageHeader, panelClass, StaffPage } from '../../features/staff/StaffUi'
import { TourTable } from '../../features/staff/components/TourParts'
import { useNow } from '../../features/staff/use-now'

/** Tour History: tours from previous days, newest first. Read-only. */
export default function TourHistoryPage() {
  const tours = useTours({ history: true })
  const now = useNow(60_000)
  const [search, setSearch] = useState('')
  const list = useMemo(() => tours.data ?? [], [tours.data])
  const completed = list.filter((t) => t.state === 'Completed').length
  const cancelled = list.filter((t) => t.state === 'Cancelled').length

  const filtered = useMemo(() => {
    if (!search.trim()) return list
    const q = search.trim().toLowerCase()
    return list.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.code.toLowerCase().includes(q) ||
        t.routeName.toLowerCase().includes(q) ||
        t.registrations.some((r) => r.schoolName.toLowerCase().includes(q)),
    )
  }, [list, search])

  return (
    <StaffPage>
      <PageHeader
        eyebrow="Báo cáo & Lịch sử"
        title="Lịch sử tour"
        description="Lịch sử các buổi tham quan từ xa trước đây. Xem lộ trình thực tế, các mốc thời gian và nhật ký can thiệp kỹ thuật."
      />

      {/* Summary KPI */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="flex items-center gap-3 rounded-2xl border border-[#e2e8f0] bg-white p-4 shadow-xs">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#eff6ff] text-[#2563eb]">
            <History size={20} />
          </span>
          <div>
            <span className="text-xs font-bold text-[#64748b]">Tổng số tour lịch sử</span>
            <span className="block text-2xl font-black text-[#0f172a] tabular-nums leading-none mt-1">
              {list.length}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border border-[#e2e8f0] bg-white p-4 shadow-xs">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#ecfdf5] text-[#16a34a]">
            <CalendarCheck size={20} />
          </span>
          <div>
            <span className="text-xs font-bold text-[#16a34a]">Hoàn thành</span>
            <span className="block text-2xl font-black text-[#0f172a] tabular-nums leading-none mt-1">
              {completed}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border border-[#e2e8f0] bg-white p-4 shadow-xs">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#fef2f2] text-[#dc2626]">
            <History size={20} />
          </span>
          <div>
            <span className="text-xs font-bold text-[#dc2626]">Đã hủy / Kết thúc sớm</span>
            <span className="block text-2xl font-black text-[#0f172a] tabular-nums leading-none mt-1">
              {cancelled}
            </span>
          </div>
        </div>
      </div>

      <section className={panelClass} aria-label="Lịch sử tour">
        <div className="flex flex-col gap-3 border-b border-[#f1f5f9] px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-sm font-bold text-[#0f172a]">Danh sách tour lưu trữ</h2>
          <div className="relative w-full sm:w-64">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8]" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm kiếm lịch sử tour…"
              aria-label="Tìm kiếm lịch sử"
              className="w-full rounded-lg border border-[#e2e8f0] bg-[#f8fafc] py-1.5 pl-8 pr-3 text-xs text-[#0f172a] outline-none placeholder:text-[#94a3b8] focus:border-[#2563eb] focus:bg-white transition-all"
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
        ) : filtered.length === 0 ? (
          <div className="p-5">
            <EmptyPanel>
              {search.trim() ? 'Không tìm thấy tour nào phù hợp với từ khóa.' : 'Chưa có tour nào trong lịch sử.'}
            </EmptyPanel>
          </div>
        ) : (
          <TourTable tours={filtered} now={now} showDate label="Lịch sử tour" />
        )}
      </section>
    </StaffPage>
  )
}
