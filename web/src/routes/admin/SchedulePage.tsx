import { useState } from 'react';
import { CalendarDays, ChevronRight, Clock3, Filter, Radio, Search } from 'lucide-react';
import { StatusBadge } from '../../features/admin-dashboard/StatusBadge';
import { todaySchedule, type TourScheduleRecord, type StatusTone } from '../../features/admin-dashboard/admin-dashboard.data';

const panelClass = 'overflow-hidden rounded-2xl border border-[#dce9fb] bg-white shadow-[0_10px_30px_rgba(69,112,167,0.07)]';

const tourTone: Record<TourScheduleRecord['status'], StatusTone> = {
  'Đang hoạt động': 'success',
  'Sắp bắt đầu': 'info',
  'Đã hoàn tất': 'neutral',
};

function TourScheduleRows({ tour, expanded, onToggle }: { tour: TourScheduleRecord; expanded: boolean; onToggle: () => void }) {
  return (
    <>
      <tr className="transition-colors hover:bg-[#f8fbff]">
        <td className="px-6 py-4 font-bold text-[#40546f]">{tour.time}</td>
        <td className="px-4 py-4">
          <span className="block font-semibold text-[#40546f]">{tour.visitorSummary}</span>
          <span className="mt-0.5 block text-xs text-[#8a98ac]">{tour.id}</span>
        </td>
        <td className="px-4 py-4 text-[#647793]">{tour.route}</td>
        <td className="px-4 py-4 font-medium text-[#647793]">{tour.session}</td>
        <td className="px-4 py-4 text-[#647793]">{tour.amr}</td>
        <td className="px-4 py-4">
          <StatusBadge
            tone={tourTone[tour.status]}
            icon={tour.status === 'Đang hoạt động' ? <Radio size={13} aria-hidden="true" /> : <Clock3 size={13} aria-hidden="true" />}
          >
            {tour.status}
          </StatusBadge>
        </td>
        <td className="px-6 py-4 text-right">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            className="inline-flex min-h-8 items-center gap-1 rounded-lg px-2 text-xs font-bold text-[#4f7fca] hover:bg-[#edf5ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f8df7]"
          >
            Chi tiết
            <ChevronRight className={`transition-transform ${expanded ? 'rotate-90' : ''}`} size={15} aria-hidden="true" />
          </button>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={7} className="bg-[#f8fbff] px-6 py-4 text-sm text-[#516783] border-b border-[#edf2fa]">
            <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
              <span><strong className="text-[#40546f]">Mã Booking:</strong> {tour.id}</span>
              <span><strong className="text-[#40546f]">Tour Session:</strong> {tour.session}</span>
              <span><strong className="text-[#40546f]">AMR Assignment:</strong> {tour.amr}</span>
              <span><strong className="text-[#40546f]">Tuyến:</strong> {tour.route}</span>
              <button className="ml-auto inline-flex items-center gap-2 rounded-lg bg-[#5b91ed] px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-[#407bd8]">
                Quản lý phiên tour
              </button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function SchedulePage() {
  const [expandedSession, setExpandedSession] = useState<string | null>(null);

  // Use todaySchedule from mock data and duplicate a few to fill the page
  const extendedSchedule = [
    ...todaySchedule,
    {
      id: 'BK-0916-001',
      time: '14:00',
      visitorSummary: 'Đoàn trường ĐH ABC',
      route: 'Tour Đổi Mới Sáng Tạo',
      session: 'TS-0916-01',
      amr: 'Chưa phân công',
      status: 'Sắp bắt đầu' as const,
    },
    {
      id: 'BK-0914-012',
      time: '10:30',
      visitorSummary: 'Nhóm khách 01',
      route: 'Tuyến tham quan chính',
      session: 'TS-0914-02',
      amr: 'AMR-02',
      status: 'Đã hoàn tất' as const,
    }
  ];

  return (
    <div className="min-h-full bg-[#f1f6fe] px-4 py-5 font-sans text-[#1f314d] sm:px-6 lg:px-8 lg:py-7">
      <div className="mx-auto w-full max-w-[1500px]">
        <header className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-[#5b91ed] mb-1">
              <CalendarDays size={14} /> Quản trị
            </div>
            <h1 className="text-2xl font-bold tracking-[-0.04em] text-[#1f314d] sm:text-[28px]">
              Lịch và phiên tour
            </h1>
            <p className="mt-1 text-sm text-[#71819a]">
              Quản lý lịch trình, phân công robot AMR và theo dõi trạng thái các phiên tour tham quan.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#a0aec0]" size={15} />
              <input 
                type="text" 
                placeholder="Tìm mã tour hoặc session..." 
                className="min-h-9 w-64 rounded-full border border-[#cce1ff] bg-white pl-9 pr-4 text-xs focus:border-[#4f8df7] focus:outline-none focus:ring-1 focus:ring-[#4f8df7]" 
              />
            </div>
            <button type="button" className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-[#cce1ff] bg-white px-4 text-xs font-bold text-[#4f7fca] transition-colors hover:bg-[#eaf4ff]">
              <Filter size={14} /> Lọc
            </button>
            <button type="button" className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-[#5b91ed] px-4 text-xs font-bold text-white shadow-[0_5px_14px_rgba(79,141,247,0.22)] transition-colors hover:bg-[#407bd8]">
              + Tạo phiên mới
            </button>
          </div>
        </header>

        <section className={panelClass}>
          <div className="flex items-center justify-between border-b border-[#edf2fa] bg-white px-5 py-4 sm:px-6">
            <div className="flex gap-6 text-sm font-semibold text-[#71819a]">
              <button className="border-b-2 border-[#5b91ed] text-[#1f314d] pb-1">Tất cả tour</button>
              <button className="border-b-2 border-transparent hover:text-[#1f314d] pb-1">Đang hoạt động (1)</button>
              <button className="border-b-2 border-transparent hover:text-[#1f314d] pb-1">Sắp tới (2)</button>
              <button className="border-b-2 border-transparent hover:text-[#1f314d] pb-1">Hoàn tất (2)</button>
            </div>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-left text-sm">
              <thead className="bg-[#f8fbff] text-[11px] font-bold text-[#6f8098] uppercase">
                <tr>
                  <th scope="col" className="px-6 py-4">Thời gian</th>
                  <th scope="col" className="px-4 py-4">Visitor / Booking</th>
                  <th scope="col" className="px-4 py-4">Route</th>
                  <th scope="col" className="px-4 py-4">Session</th>
                  <th scope="col" className="px-4 py-4">AMR</th>
                  <th scope="col" className="px-4 py-4">Trạng thái</th>
                  <th scope="col" className="px-6 py-4 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#edf2fa] bg-white">
                {extendedSchedule.map((tour) => (
                  <TourScheduleRows 
                    key={tour.id} 
                    tour={tour} 
                    expanded={expandedSession === tour.session} 
                    onToggle={() => setExpandedSession((current) => current === tour.session ? null : tour.session)} 
                  />
                ))}
              </tbody>
            </table>
          </div>
          
          <div className="flex items-center justify-between border-t border-[#edf2fa] bg-[#f8fbff] px-6 py-4">
            <span className="text-xs text-[#71819a]">Hiển thị 1-5 trong tổng số 5 phiên tour</span>
            <div className="flex gap-1">
              <button className="grid h-8 w-8 place-items-center rounded-lg border border-[#dce9fb] bg-white text-[#8a98ac] hover:bg-[#f1f6fe]" disabled>
                <ChevronRight size={16} className="rotate-180" />
              </button>
              <button className="grid h-8 w-8 place-items-center rounded-lg bg-[#5b91ed] text-white font-bold text-xs">
                1
              </button>
              <button className="grid h-8 w-8 place-items-center rounded-lg border border-[#dce9fb] bg-white text-[#8a98ac] hover:bg-[#f1f6fe]" disabled>
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
