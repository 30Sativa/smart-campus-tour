import { CalendarDays, ChevronRight, Filter } from 'lucide-react'
import { Link, useSearchParams } from 'react-router'
import { useMemo } from 'react'
import { useStaffSchedule } from '../../api/staff-hooks'
import { ErrorPanel, formatTime, LoadingPanel, PageHeader, panelClass, StatusPill } from '../../components/staff/StaffUi'

const filters = ['All', 'Today', 'Upcoming', 'Scheduled', 'Active', 'Paused', 'Completed', 'Cancelled']

export default function StaffSchedulePage() {
  const [params, setParams] = useSearchParams()
  const status = params.get('status') || 'All'
  const date = params.get('date') || undefined
  const query = useMemo(() => ({ status, date }), [status, date])
  const schedule = useStaffSchedule(query)
  const setStatus = (next: string) => setParams((current) => { if (next === 'All') current.delete('status'); else current.set('status', next); return current })

  return <div className="min-h-full bg-[#f1f6fe] px-4 py-5 font-sans sm:px-6 lg:px-8 lg:py-7"><div className="mx-auto w-full max-w-[1500px]">
    <PageHeader icon={<CalendarDays size={14} />} title="Lịch và phiên tour" description="Xem và điều phối các phiên tour. Thông tin lịch là chỉ đọc; thao tác gán AMR chỉ khả dụng trong chi tiết phiên chưa bắt đầu." action={<label className="flex min-h-10 items-center gap-2 rounded-xl border border-[#cce1ff] bg-white px-3 text-xs font-bold text-[#4f7fca]"><Filter size={15} />Ngày<input type="date" value={date || ''} onChange={(event) => setParams((current) => { if (event.target.value) current.set('date', event.target.value); else current.delete('date'); return current })} className="bg-transparent outline-none" /></label>} />
    <section className={panelClass}><div className="flex gap-2 overflow-x-auto border-b border-[#edf2fa] px-5 py-3">{filters.map((item) => <button key={item} type="button" onClick={() => setStatus(item)} className={`shrink-0 rounded-full px-3 py-2 text-xs font-bold ${status === item ? 'bg-[#eaf4ff] text-[#3a6fd8]' : 'text-[#71819a] hover:bg-[#f6f9fd]'}`}>{item === 'All' ? 'Tất cả' : item === 'Today' ? 'Hôm nay' : item === 'Upcoming' ? 'Sắp tới' : item}</button>)}</div>
      {schedule.isPending ? <div className="p-5"><LoadingPanel /></div> : schedule.isError ? <div className="p-5"><ErrorPanel error={schedule.error} /></div> : schedule.data.length === 0 ? <div className="p-12 text-center text-sm font-medium text-[#71819a]">Không có phiên tour phù hợp với bộ lọc hiện tại.</div> : <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-left text-sm"><thead className="bg-[#f8fbff] text-[11px] font-bold text-[#71819a]"><tr><th className="px-6 py-4">Thời gian</th><th className="px-4 py-4">Tuyến tham quan</th><th className="px-4 py-4">Khách / booking</th><th className="px-4 py-4">AMR</th><th className="px-4 py-4">Trạng thái</th><th className="px-6 py-4 text-right">Chi tiết</th></tr></thead><tbody className="divide-y divide-[#edf2fa] bg-white">{schedule.data.map((tour) => <tr key={tour.sessionId} className="hover:bg-[#f8fbff]"><td className="px-6 py-4"><p className="font-bold text-[#40546f]">{formatTime(tour.startTime)}–{formatTime(tour.endTime)}</p><p className="mt-1 text-xs text-[#8a98ac]">{new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium' }).format(new Date(tour.startTime))}</p></td><td className="px-4 py-4 font-semibold text-[#40546f]">{tour.routeName}</td><td className="px-4 py-4"><p className="font-medium text-[#647793]">{tour.visitorName || 'Không công khai'}</p><p className="mt-1 font-mono text-[11px] text-[#9aa8bd]">{tour.bookingId.slice(0, 8)}</p></td><td className="px-4 py-4 text-[#647793]">{tour.amrName || <span className="font-semibold text-[#a96d0b]">Chưa gán</span>}</td><td className="px-4 py-4"><StatusPill value={tour.status} /></td><td className="px-6 py-4 text-right"><Link to={`/staff/tours/${tour.sessionId}`} className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-bold text-[#4f7fca] hover:bg-[#edf5ff]">Mở phiên<ChevronRight size={15} /></Link></td></tr>)}</tbody></table></div>}
    </section>
  </div></div>
}
