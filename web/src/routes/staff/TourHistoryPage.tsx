import { useState, useMemo } from 'react'
import { CalendarCheck, CircleX, History } from 'lucide-react'
import { useTours } from '../../features/staff/staff-hooks'
import { EmptyPanel, ErrorPanel, LoadingPanel, PageHeader, Pagination, SearchField, StatStrip, StatTile, panelClass, StaffPage } from '../../features/staff/StaffUi'
import { usePagination } from '../../features/staff/use-pagination'

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

  const filtered = useMemo(() => {
    if (!search.trim()) return list
    const q = fold(search.trim())
    return list.filter((t) => fold(`${t.name} ${t.code} ${t.routeName} ${t.registrations.map((r) => r.schoolName).join(' ')}`).includes(q))
  }, [list, search])
  const paged = usePagination(filtered, 10, search)

  return (
    <StaffPage>
      <PageHeader
        eyebrow="Báo cáo & Lịch sử"
        title="Lịch sử tour"
        description="Lịch sử các buổi tham quan từ xa trước đây. Xem lộ trình thực tế, các mốc thời gian và nhật ký can thiệp kỹ thuật."
      />

      <StatStrip label="Tổng hợp lịch sử" columns="sm:grid-cols-3">
        <StatTile icon={History} label="Buổi trong lịch sử" value={list.length} />
        <StatTile icon={CalendarCheck} label="Hoàn thành" value={completed} />
        <StatTile icon={CircleX} label="Kết thúc sớm / hủy" value={cancelled} tone={cancelled ? 'danger' : undefined} />
      </StatStrip>

      <section className={`${panelClass} mt-6`} aria-label="Lịch sử tour">
        <div className="flex flex-col gap-3 border-b border-[#f1f5f9] px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-[15px] font-semibold text-[#0f172a]">Danh sách tour lưu trữ</h2>
          <SearchField value={search} onChange={setSearch} label="Tìm kiếm lịch sử" placeholder="Tìm theo buổi, mã, tuyến hoặc trường…" className="w-full sm:w-72" />
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
          <>
            <TourTable tours={paged.rows} now={now} showDate label="Lịch sử tour" />
            <Pagination page={paged.page} pageCount={paged.pageCount} total={paged.total} pageSize={paged.pageSize} onPage={paged.setPage} label="Phân trang lịch sử tour" />
          </>
        )}
      </section>
    </StaffPage>
  )
}
