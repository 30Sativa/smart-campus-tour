import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react'
import { useSearchParams } from 'react-router'
import { useTours } from '../../features/staff/staff-hooks'
import { EmptyPanel, ErrorPanel, LoadingPanel, PageHeader, panelClass, StaffPage } from '../../features/staff/StaffUi'
import { buttonClass } from '../../features/staff/ui-classes'
import { TourTable } from '../../features/staff/components/TourParts'
import { useNow } from '../../features/staff/use-now'

const dayKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

function shift(day: string, delta: number) {
  const date = new Date(`${day}T12:00:00`)
  date.setDate(date.getDate() + delta)
  return dayKey(date)
}

/**
 * Tour Schedule: any day's tours, one day at a time. Today opens by default;
 * past days read from history.
 */
export default function SchedulePage() {
  const [params, setParams] = useSearchParams()
  const today = dayKey(new Date())
  const day = params.get('date') ?? today
  const tours = useTours({ date: day })
  const now = useNow(30_000)

  const setDay = (next: string) =>
    setParams((current) => {
      if (next === today) current.delete('date')
      else current.set('date', next)
      return current
    })

  const heading = new Intl.DateTimeFormat('vi-VN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${day}T12:00:00`))

  const isToday = day === today

  return (
    <StaffPage>
      <PageHeader
        eyebrow="Lịch trình"
        title="Lịch tour"
        description="Xem lịch theo ngày. Lịch được tạo từ các đơn đặt tour được duyệt; nhân viên vận hành theo dõi và chuẩn bị thiết bị tương ứng."
        action={
          <div className="flex items-center gap-2 bg-white border border-[#e2e8f0] p-1.5 rounded-xl shadow-xs">
            <button
              type="button"
              onClick={() => setDay(shift(day, -1))}
              className={buttonClass('secondary', 'sm')}
              aria-label="Ngày trước"
            >
              <ChevronLeft size={16} />
            </button>
            <div className="relative flex items-center">
              <input
                type="date"
                value={day}
                onChange={(event) => event.target.value && setDay(event.target.value)}
                aria-label="Chọn ngày"
                className="min-h-8.5 rounded-lg border border-[#e2e8f0] bg-[#f8fafc] px-3 text-xs font-bold text-[#0f172a] outline-none focus:ring-2 focus:ring-[#2563eb]"
              />
            </div>
            <button
              type="button"
              onClick={() => setDay(shift(day, 1))}
              className={buttonClass('secondary', 'sm')}
              aria-label="Ngày sau"
            >
              <ChevronRight size={16} />
            </button>
            {!isToday && (
              <button type="button" onClick={() => setDay(today)} className={buttonClass('ghost', 'sm')}>
                Hôm nay
              </button>
            )}
          </div>
        }
      />

      <section className={panelClass} aria-label={`Lịch tour ${heading}`}>
        <div className="flex items-center justify-between gap-3 border-b border-[#f1f5f9] px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded-lg bg-[#eff6ff] text-[#2563eb]">
              <Calendar size={16} />
            </span>
            <div>
              <h2 className="font-bold text-sm text-[#0f172a] first-letter:uppercase">{heading}</h2>
              {isToday && <span className="text-[11px] font-semibold text-[#16a34a]">Hôm nay</span>}
            </div>
          </div>
          {tours.data && (
            <span className="text-xs font-semibold text-[#64748b] bg-[#f1f5f9] px-2.5 py-1 rounded-md tabular-nums">
              {tours.data.length} tour được lên lịch
            </span>
          )}
        </div>

        {tours.isPending ? (
          <div className="p-5">
            <LoadingPanel />
          </div>
        ) : tours.isError ? (
          <div className="p-5">
            <ErrorPanel error={tours.error} onRetry={tours.refetch} />
          </div>
        ) : tours.data.length === 0 ? (
          <div className="p-5">
            <EmptyPanel>Không có tour nào trong ngày này.</EmptyPanel>
          </div>
        ) : (
          <TourTable tours={tours.data} now={now} label="Lịch tour" />
        )}
      </section>
    </StaffPage>
  )
}
