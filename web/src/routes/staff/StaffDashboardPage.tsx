import { Activity, BellRing, Bot, CalendarClock, CalendarDays, CheckCircle2, CircleAlert, Radio, WifiOff } from 'lucide-react'
import { Link } from 'react-router'
import { useStaffDashboard } from '../../api/staff-hooks'
import { EmptyPanel, ErrorPanel, LoadingPanel, PageHeader, panelClass, StatusPill } from '../../components/staff/StaffUi'
import { formatDateTime, formatTime } from '../../components/staff/StaffFormatters'

const cards = [
  { key: 'todayTours', label: 'Tour hôm nay', icon: CalendarDays, color: 'text-[#4f7fca]', bg: 'bg-[#eaf4ff]' },
  { key: 'upcomingTours', label: 'Sắp tới', icon: CalendarClock, color: 'text-[#5f78b7]', bg: 'bg-[#eef1ff]' },
  { key: 'activeTours', label: 'Đang hoạt động', icon: Activity, color: 'text-[#25895f]', bg: 'bg-[#effbf5]' },
  { key: 'completedTours', label: 'Đã hoàn tất', icon: CheckCircle2, color: 'text-[#268268]', bg: 'bg-[#eff8f3]' },
  { key: 'pendingTours', label: 'Chờ điều phối', icon: CircleAlert, color: 'text-[#a96d0b]', bg: 'bg-[#fff9e9]' },
  { key: 'activeAmrs', label: 'AMR đang chạy', icon: Bot, color: 'text-[#3a6fd8]', bg: 'bg-[#eaf4ff]' },
  { key: 'offlineAmrs', label: 'AMR mất kết nối', icon: WifiOff, color: 'text-[#c95042]', bg: 'bg-[#fff1ef]' },
  { key: 'activeAlerts', label: 'Cảnh báo mở', icon: BellRing, color: 'text-[#a96d0b]', bg: 'bg-[#fff9e9]' },
  { key: 'criticalAlerts', label: 'Cảnh báo nghiêm trọng', icon: CircleAlert, color: 'text-[#c95042]', bg: 'bg-[#fff1ef]' },
] as const

export default function StaffDashboardPage() {
  const dashboard = useStaffDashboard()
  if (dashboard.isPending) return <div className="min-h-full bg-[#f1f6fe] p-5 sm:p-6 lg:p-8"><LoadingPanel /></div>
  if (dashboard.isError) return <div className="min-h-full bg-[#f1f6fe] p-5 sm:p-6 lg:p-8"><ErrorPanel error={dashboard.error} /></div>
  const data = dashboard.data

  return <div className="min-h-full bg-[#f1f6fe] px-4 py-5 font-sans sm:px-6 lg:px-8 lg:py-7"><div className="mx-auto w-full max-w-[1500px]">
    <PageHeader icon={<Radio size={14} />} title="Tình hình điều hành" description="Theo dõi tour, đội AMR và cảnh báo theo dữ liệu vận hành hiện có. Trạng thái kết nối được phân biệt rõ giữa Live, Stale và Disconnected." action={<Link to="/staff/schedule" className="inline-flex min-h-10 items-center justify-center rounded-xl bg-[#5b91ed] px-4 text-sm font-bold text-white shadow-[0_8px_18px_rgba(79,141,247,0.24)] hover:bg-[#407bd8]">Xem lịch tour</Link>} />
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">{cards.map(({ key, label, icon: Icon, color, bg }) => <div key={key} className={`${panelClass} flex min-h-28 items-center gap-4 p-4`}><span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${bg} ${color}`}><Icon size={21} /></span><div><p className="text-2xl font-extrabold tracking-[-0.05em] text-[#1f314d]">{data[key]}</p><p className="mt-1 text-xs font-semibold text-[#71819a]">{label}</p></div></div>)}</section>
    <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(340px,0.8fr)]">
      <section className={panelClass}><div className="flex items-center justify-between border-b border-[#edf2fa] px-5 py-4"><div><h3 className="font-bold text-[#40546f]">Lịch tour hôm nay</h3><p className="mt-0.5 text-xs text-[#8a98ac]">Phiên tour theo lịch đã đặt</p></div><Link to="/staff/schedule" className="text-xs font-bold text-[#4f7fca] hover:underline">Mở lịch</Link></div>{data.todaySchedule.length === 0 ? <div className="p-5"><EmptyPanel>Chưa có phiên tour nào trong ngày đã chọn.</EmptyPanel></div> : <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead className="bg-[#f8fbff] text-[11px] font-bold text-[#71819a]"><tr><th className="px-5 py-3">Thời gian</th><th className="px-4 py-3">Tuyến</th><th className="px-4 py-3">AMR</th><th className="px-5 py-3">Trạng thái</th></tr></thead><tbody className="divide-y divide-[#edf2fa]">{data.todaySchedule.map((tour) => <tr key={tour.sessionId} className="hover:bg-[#f8fbff]"><td className="px-5 py-3 font-bold text-[#40546f]">{formatTime(tour.startTime)}</td><td className="px-4 py-3"><Link to={`/staff/tours/${tour.sessionId}`} className="font-semibold text-[#40546f] hover:text-[#3a6fd8]">{tour.routeName}</Link><span className="mt-0.5 block text-xs text-[#8a98ac]">Khách: {tour.visitorName || 'Không công khai'}</span></td><td className="px-4 py-3 text-[#647793]">{tour.amrName || 'Chưa gán'}</td><td className="px-5 py-3"><StatusPill value={tour.status} /></td></tr>)}</tbody></table></div>}</section>
      <section className={panelClass}><div className="flex items-center justify-between border-b border-[#edf2fa] px-5 py-4"><div><h3 className="font-bold text-[#40546f]">Cảnh báo gần đây</h3><p className="mt-0.5 text-xs text-[#8a98ac]">Chỉ cảnh báo chưa xác nhận</p></div><Link to="/staff/alerts" className="text-xs font-bold text-[#4f7fca] hover:underline">Xem tất cả</Link></div>{data.recentAlerts.length === 0 ? <div className="p-5"><EmptyPanel>Không có cảnh báo mở.</EmptyPanel></div> : <div className="divide-y divide-[#edf2fa]">{data.recentAlerts.map((alert) => <Link key={alert.id} to="/staff/alerts" className="block px-5 py-4 hover:bg-[#f8fbff]"><div className="flex items-start justify-between gap-3"><p className="text-sm font-semibold text-[#40546f]">{alert.message}</p><StatusPill value={alert.severity} /></div><p className="mt-2 text-xs text-[#8a98ac]">{alert.amrName || 'Hệ thống'} · {formatDateTime(alert.createdAt)}</p></Link>)}</div>}</section>
    </div>
    <section className={`${panelClass} mt-5`}><div className="flex items-center justify-between border-b border-[#edf2fa] px-5 py-4"><div><h3 className="font-bold text-[#40546f]">Đội AMR cần chú ý</h3><p className="mt-0.5 text-xs text-[#8a98ac]">Live, Stale và Disconnected không được gộp thành trạng thái khỏe mạnh.</p></div><Link to="/staff/amr" className="text-xs font-bold text-[#4f7fca] hover:underline">Theo dõi AMR</Link></div>{data.activeAmrsList.length === 0 ? <div className="p-5"><EmptyPanel>Hiện không có AMR đang vận hành hoặc cần theo dõi.</EmptyPanel></div> : <div className="grid divide-y divide-[#edf2fa] md:grid-cols-2 md:divide-x md:divide-y-0">{data.activeAmrsList.map((amr) => <div key={amr.id} className="flex items-center justify-between gap-4 p-5"><div><p className="font-bold text-[#40546f]">{amr.name}</p><p className="mt-1 text-xs text-[#71819a]">Pin {amr.batteryPercent.toFixed(0)}% · {amr.currentPoi || 'Chưa có POI'}</p></div><div className="text-right"><StatusPill value={amr.connectionState} /><p className="mt-2 text-xs font-semibold text-[#71819a]">{amr.operationalState}</p></div></div>)}</div>}</section>
  </div></div>
}
