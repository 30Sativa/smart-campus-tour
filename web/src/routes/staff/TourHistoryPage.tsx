import { useState, useMemo } from 'react'
import { useTours } from '../../features/staff/staff-hooks'
import { EmptyPanel, ErrorPanel, StaffPage } from '../../features/staff/StaffUi'
import { LoadingPanel, PageHeader, Pagination, SearchField, panelClass } from '../../components/ui/ConsolePrimitives'
import { Donut, HBars, KpiRow, KpiTile } from '../../components/ui/Charts'
import { groupSummary } from '../../features/staff/attention'
import { usePagination } from '../../components/ui/use-pagination'

/** Case- and diacritic-insensitive, so "le quy don" finds "Lê Quý Đôn". */
const fold = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').replace(/[đĐ]/g, 'd').toLowerCase()
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
  const students = list.reduce((sum, t) => sum + groupSummary(t).students, 0)
  const byRoute = useMemo(() => {
    const counts = new Map<string, number>()
    for (const t of list) counts.set(t.routeName, (counts.get(t.routeName) ?? 0) + 1)
    const max = Math.max(1, ...counts.values())
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([label, value]) => ({ label, value, max }))
  }, [list])

  const filtered = useMemo(() => {
    if (!search.trim()) return list
    const q = fold(search.trim())
    return list.filter((t) => fold(`${t.name} ${t.code} ${t.routeName} ${t.registrations.map((r) => r.schoolName).join(' ')}`).includes(q))
  }, [list, search])
  const paged = usePagination(filtered, 10, search)

  return (
    <StaffPage>
      <PageHeader
        eyebrow="Lịch sử"
        title="Lịch sử tour"
        description="Lịch sử các buổi tham quan từ xa trước đây. Xem lộ trình thực tế, các mốc thời gian và nhật ký can thiệp kỹ thuật."
      />

      <KpiRow label="Tổng hợp lịch sử">
        <KpiTile label="Buổi trong lịch sử" value={tours.data ? list.length : '-'} />
        <KpiTile label="Tỉ lệ hoàn thành" value={tours.data && list.length ? `${Math.round((completed / list.length) * 100)}%` : '—'} note={tours.data ? `${completed}/${list.length} buổi` : undefined} />
        <KpiTile label="Kết thúc sớm / hủy" value={tours.data ? cancelled : '-'} tone={cancelled ? 'danger' : 'plain'} />
        <KpiTile label="Học sinh đã tham gia" value={tours.data ? students : '-'} note={list.length ? `~${Math.round(students / list.length)} / buổi` : undefined} />
      </KpiRow>


      <section className={`${panelClass} mt-4`} aria-label="Lịch sử tour">
        <div className="flex flex-col gap-3 border-b border-[#f1f5f9] px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-[15px] font-semibold text-[#0f172a]">Danh sách tour lưu trữ</h2>
          <SearchField value={search} onChange={setSearch} label="Tìm kiếm lịch sử" placeholder="Tìm theo buổi, mã, tuyến hoặc trường…" className="w-full sm:w-72" />
        </div>

        {tours.isPending ? (
          <div className="p-4">
            <LoadingPanel />
          </div>
        ) : tours.isError ? (
          <div className="p-4">
            <ErrorPanel error={tours.error} onRetry={tours.refetch} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-4">
            <EmptyPanel>
              {search.trim() ? 'Không tìm thấy tour nào phù hợp với từ khóa.' : 'Chưa có tour nào trong lịch sử.'}
            </EmptyPanel>
          </div>
        ) : (
          <>
            <TourTable tours={paged.rows} now={now} showDate label="Lịch sử tour" />
            <Pagination page={paged.page} pageCount={paged.pageCount} total={paged.total} pageSize={paged.pageSize} onPage={paged.setPage} label="Phân trang lịch sử tour" />
          </>
        )}
      </section>
      {list.length > 0 && !tours.isError && (
        <details className="mt-5 rounded-xl border border-[#e2e8f0] bg-white p-4">
          <summary className="cursor-pointer text-sm font-semibold text-[#173b59]">Xem biểu đồ tổng hợp</summary>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <section className={panelClass} aria-label="Kết quả các buổi">
            <h2 className="border-b border-[#eef1f4] px-3.5 py-2.5 text-[13px] font-semibold text-[#0f172a]">Các buổi kết thúc thế nào</h2>
            <Donut label="Kết quả các buổi" unit="buổi" parts={[
              { label: 'Hoàn thành', value: completed, color: '#1f7a55' },
              { label: 'Kết thúc sớm / hủy', value: cancelled, color: '#b23e31' },
              { label: 'Khác', value: list.length - completed - cancelled, color: '#cbd5e1' },
            ]} />
          </section>
          <section className={panelClass} aria-label="Buổi theo tuyến">
            <h2 className="border-b border-[#eef1f4] px-3.5 py-2.5 text-[13px] font-semibold text-[#0f172a]">Buổi theo tuyến</h2>
            <HBars rows={byRoute} />
          </section>
        </div>
        </details>
      )}

    </StaffPage>
  )
}
