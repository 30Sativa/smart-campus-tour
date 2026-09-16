import { useState } from 'react';
import { Link } from 'react-router';
import {
  AlertTriangle,
  ArrowRight,
  BatteryMedium,
  Bell,
  Bot,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Clock3,
  FileCheck2,
  Info,
  Radio,
  Route,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import {
  alerts,
  operationalSummary,
  pendingActions,
  todaySchedule,
  type AlertRecord,
  type StatusTone,
  type TourScheduleRecord,
} from './admin-dashboard.data';
import { StatusBadge } from './StatusBadge';

const panelClass = 'overflow-hidden rounded-2xl border border-[#dce9fb] bg-white shadow-[0_10px_30px_rgba(69,112,167,0.07)]';

const summaryIcons = [Bot, Radio, Route, CircleAlert, FileCheck2];

const severityTone: Record<AlertRecord['severity'], StatusTone> = {
  Cao: 'danger',
  'Trung bình': 'warning',
  'Thông tin': 'info',
};

const tourTone: Record<TourScheduleRecord['status'], StatusTone> = {
  'Đang hoạt động': 'success',
  'Sắp bắt đầu': 'info',
  'Đã hoàn tất': 'neutral',
};

function Sparkline({ color = '#4f8df7', values }: { color?: string; values: number[] }) {
  const points = values.map((value, index) => `${(index / (values.length - 1)) * 100},${34 - value * 0.28}`).join(' ');

  return (
    <svg className="h-9 w-24 overflow-visible" viewBox="0 0 100 40" fill="none" aria-hidden="true">
      <path d="M0 38H100" stroke="#e9f1fc" strokeWidth="2" />
      <polyline points={points} stroke={color} strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
      {values.map((value, index) => (
        <circle key={`${value}-${index}`} cx={(index / (values.length - 1)) * 100} cy={34 - value * 0.28} r="1.9" fill={color} />
      ))}
    </svg>
  );
}

function SectionHeader({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-start justify-between gap-4 px-5 pt-5 pb-4 sm:px-6">
      <div className="min-w-0">
        <h2 className="text-[15px] font-bold tracking-[-0.01em] text-[#1f314d]">{title}</h2>
        {description && <p className="mt-1 text-xs leading-5 text-[#71819a]">{description}</p>}
      </div>
      {action}
    </div>
  );
}

function OperationalSummary() {
  const sparklineValues = [
    [32, 39, 48, 44, 58, 67, 62],
    [20, 28, 24, 46, 37, 56, 49],
    [18, 24, 20, 37, 31, 43, 39],
    [16, 30, 20, 44, 32, 52, 48],
    [28, 25, 40, 36, 46, 42, 55],
  ];

  return (
    <section id="system-readiness" aria-labelledby="system-readiness-title" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <h2 id="system-readiness-title" className="sr-only">Tóm tắt trạng thái vận hành</h2>
      {operationalSummary.map((item, index) => {
        const Icon = summaryIcons[index];
        return (
          <article key={item.label} className={`${panelClass} min-h-[132px] p-4`}>
            <div className="flex items-start justify-between gap-2">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#edf5ff] text-[#4f8df7]">
                <Icon size={18} strokeWidth={2} aria-hidden="true" />
              </span>
              <Sparkline
                values={sparklineValues[index]}
                color={item.tone === 'danger' ? '#ed7b6c' : item.tone === 'warning' ? '#e5aa47' : '#5b91ed'}
              />
            </div>
            <p className="mt-3 text-xs font-medium text-[#7b8aa1]">{item.label}</p>
            <div className="mt-1 flex items-end justify-between gap-2">
              <p className="text-2xl font-bold tracking-[-0.04em] text-[#1f314d]">{item.value}</p>
              <p className="pb-0.5 text-right text-[10px] font-medium text-[#8a98ac]">{item.detail}</p>
            </div>
          </article>
        );
      })}
    </section>
  );
}

function RobotOverview() {
  return (
    <section aria-labelledby="robot-overview-title" className={`${panelClass} relative min-h-[288px] bg-[linear-gradient(115deg,#eef7ff_0%,#ffffff_66%)]`}>
      <SectionHeader
        title="AMR đang kết nối"
        action={<button type="button" aria-label="Xem chi tiết AMR-01" className="grid h-8 w-8 place-items-center rounded-full bg-white text-[#6f8fc2] shadow-sm transition-colors hover:bg-[#edf5ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f8df7]"><ChevronRight size={17} aria-hidden="true" /></button>}
      />
      <h2 id="robot-overview-title" className="sr-only">Thông tin AMR-01 đang kết nối</h2>
      <div className="relative z-10 px-5 pb-5 sm:px-6">
        <div className="flex max-w-[57%] flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[#39c490] shadow-[0_0_0_4px_rgba(57,196,144,0.14)]" aria-hidden="true" />
            <span className="text-[11px] font-bold text-[#299b70]">Trực tuyến</span>
          </div>
          <p className="text-2xl font-bold tracking-[-0.04em] text-[#1f314d]">AMR-01</p>
          <p className="text-xs leading-5 text-[#71819a]">Đang thực hiện tuyến tham quan chính.</p>
        </div>
        <div className="mt-5 flex max-w-[64%] flex-wrap gap-x-5 gap-y-3 rounded-xl border border-white/80 bg-white/70 p-3 backdrop-blur-sm">
          <div><p className="text-[10px] font-medium text-[#8090a6]">Nhiệm vụ</p><p className="mt-0.5 text-xs font-bold text-[#304867]">Navigating</p></div>
          <div><p className="text-[10px] font-medium text-[#8090a6]">Pin</p><p className="mt-0.5 flex items-center gap-1 text-xs font-bold text-[#304867]"><BatteryMedium size={14} aria-hidden="true" />78%</p></div>
          <div><p className="text-[10px] font-medium text-[#8090a6]">Telemetry</p><p className="mt-0.5 text-xs font-bold text-[#304867]">8 giây trước</p></div>
        </div>
      </div>
      <div className="pointer-events-none absolute right-0 bottom-0 flex h-[242px] w-[48%] items-end justify-end overflow-hidden">
        <div className="absolute right-[-10%] bottom-[-42%] h-64 w-64 rounded-full bg-[#cce6ff]/60 blur-2xl" />
        <img src="/smartbus-robot.jpg" alt="" className="relative h-[235px] w-full object-cover object-[59%_44%] mix-blend-multiply opacity-95" />
      </div>
    </section>
  );
}

function RobotListPanel() {
  const robots = [
    { id: 'AMR-01', name: 'Rover Alpha', status: 'Sẵn sàng', battery: 95, tone: 'success' },
    { id: 'AMR-02', name: 'Rover Beta', status: 'Đang hoạt động', battery: 78, tone: 'success' },
    { id: 'AMR-03', name: 'Rover Gamma', status: 'Đang sạc', battery: 35, tone: 'warning' },
  ];

  return (
    <section aria-labelledby="robot-list-title" className={`${panelClass} overflow-hidden bg-white`}>
      <SectionHeader
        title="Danh sách Robot (AMR)"
        action={<span className="text-[11px] font-bold text-[#5b91ed]">Quản lý</span>}
      />
      <h2 id="robot-list-title" className="sr-only">Danh sách các robot đang hoạt động</h2>
      <div className="flex flex-col gap-2.5 px-5 pb-5 sm:px-6">
        {robots.map(r => (
          <div key={r.id} className="flex items-center justify-between rounded-xl bg-[#f7fbff] p-3 transition-colors hover:bg-[#edf5ff]">
            <div className="flex items-center gap-3">
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white text-[#5b91ed] shadow-sm">
                <Bot size={16} aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-[#354a66]">{r.name}</p>
                <div className="mt-0.5 flex items-center gap-1.5 text-[10px] font-medium text-[#8492a6]">
                  <span>{r.id}</span>
                  <span className="h-0.5 w-0.5 rounded-full bg-[#cbd5e1]" />
                  <span className={r.tone === 'success' ? 'text-[#39c490]' : 'text-[#e5aa47]'}>{r.status}</span>
                </div>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className="flex items-center gap-1 text-[11px] font-bold text-[#40546f]">
                <BatteryMedium size={14} className={r.battery < 40 ? 'text-[#ed7b6c]' : 'text-[#39c490]'} aria-hidden="true" />
                {r.battery}%
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function CurrentTourPanel() {
  return (
    <section aria-labelledby="current-tour-title" className={`${panelClass} overflow-hidden`}>
      <SectionHeader
        title="Tour đang hoạt động"
        action={<StatusBadge tone="success" icon={<CheckCircle2 size={13} aria-hidden="true" />}>Đang chạy</StatusBadge>}
      />
      <div className="px-5 pb-5 sm:px-6">
        <div className="flex items-start justify-between gap-3 rounded-xl bg-[#f7fbff] p-3.5">
          <div><p className="text-[11px] font-medium text-[#8090a6]">Tour Session</p><p className="mt-1 text-lg font-bold tracking-[-0.025em] text-[#31435c]">TS-0915-01</p></div>
          <span className="rounded-lg bg-white px-2.5 py-1 text-xs font-bold text-[#5b91ed] shadow-sm">AMR-01</span>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <div><dt className="text-[10px] font-medium text-[#8090a6]">Booking</dt><dd className="mt-0.5 text-xs font-semibold text-[#40546f]">Nhóm khách 04</dd></div>
          <div><dt className="text-[10px] font-medium text-[#8090a6]">Route</dt><dd className="mt-0.5 text-xs font-semibold text-[#40546f]">Tuyến chính</dd></div>
          <div><dt className="text-[10px] font-medium text-[#8090a6]">Bắt đầu</dt><dd className="mt-0.5 text-xs font-semibold text-[#40546f]">09:00</dd></div>
          <div><dt className="text-[10px] font-medium text-[#8090a6]">POI hiện tại</dt><dd className="mt-0.5 text-xs font-semibold text-[#40546f]">POI-02</dd></div>
        </dl>
        <div className="mt-4">
          <div className="flex justify-between text-[11px]"><span className="font-medium text-[#8090a6]">Tiến độ tuyến</span><span className="font-bold text-[#4a658b]">2 / 4 POI</span></div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#e8f0fc]" role="progressbar" aria-label="Tiến độ tour" aria-valuemin={0} aria-valuemax={4} aria-valuenow={2}><div className="h-full w-1/2 rounded-full bg-[#5b91ed]" /></div>
        </div>
        <Link to="/admin/digital-twin" className="mt-5 flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#eff6ff] px-4 text-xs font-bold text-[#407bd8] transition-colors hover:bg-[#dcecff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f8df7] focus-visible:ring-offset-2">Mở Digital Twin <ArrowRight size={15} aria-hidden="true" /></Link>
      </div>
    </section>
  );
}



function AttentionPanel() {
  return (
    <section id="alerts" aria-labelledby="alerts-title" className={panelClass}>
      <SectionHeader title="Thông báo cần chú ý" description="Cảnh báo giữ nguyên lịch sử sau khi được ghi nhận hoặc xử lý." action={<Bell className="text-[#7d9bd0]" size={18} aria-hidden="true" />} />
      <h2 id="alerts-title" className="sr-only">Cảnh báo và việc cần chú ý</h2>
      <div className="divide-y divide-[#edf2fa]">
        {alerts.map((alert) => (
          <details key={alert.id} className="group">
            <summary className="grid cursor-pointer list-none gap-3 px-5 py-4 transition-colors hover:bg-[#f8fbff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#4f8df7] sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center sm:px-6">
              <StatusBadge tone={severityTone[alert.severity]} icon={alert.severity === 'Cao' ? <AlertTriangle size={13} aria-hidden="true" /> : <Info size={13} aria-hidden="true" />}>{alert.severity}</StatusBadge>
              <div className="min-w-0"><p className="truncate text-sm font-bold text-[#354a66]">{alert.title}</p><p className="mt-1 text-[11px] text-[#8492a6]">{alert.source} / {alert.target} / {alert.occurredAt}</p></div>
              <div className="flex items-center gap-2 justify-self-end"><span className="text-[11px] font-semibold text-[#71819a]">{alert.status}</span><ChevronRight className="text-[#6f9ae3] transition-transform group-open:rotate-90" size={16} aria-hidden="true" /></div>
            </summary>
            <div className="bg-[#f8fbff] px-5 py-4 text-sm text-[#516783] sm:px-6"><p className="leading-6">{alert.description}</p><p className="mt-2 leading-6"><span className="font-bold text-[#40546f]">Khôi phục:</span> {alert.recovery}</p><p className="mt-2 text-xs text-[#8492a6]">Alert ID: {alert.id}</p></div>
          </details>
        ))}
      </div>
    </section>
  );
}

function PendingActionsPanel() {
  return (
    <section id="pending-actions" aria-labelledby="pending-actions-title" className={panelClass}>
      <SectionHeader title="Hoạt động gần đây" description="Review không tự động áp dụng cấu hình." action={<span className="text-[11px] font-bold text-[#5b91ed]">Xem tất cả</span>} />
      <h2 id="pending-actions-title" className="sr-only">Hành động chờ Admin</h2>
      <div className="divide-y divide-[#edf2fa]">
        {pendingActions.map((item, index) => (
          <details key={item.id} className="group">
            <summary className="cursor-pointer list-none px-5 py-4 transition-colors hover:bg-[#f8fbff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#4f8df7] sm:px-6">
              <div className="flex items-start gap-3"><span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg ${index === 0 ? 'bg-[#edf5ff] text-[#5b91ed]' : index === 1 ? 'bg-[#f5f0ff] text-[#9070d5]' : 'bg-[#fff7e8] text-[#d99b28]'}`}><FileCheck2 size={16} aria-hidden="true" /></span><div className="min-w-0 flex-1"><p className="text-sm font-bold text-[#40546f]">{item.title}</p><p className="mt-1 text-[11px] text-[#8492a6]">{item.due}</p></div><ChevronRight className="mt-1 shrink-0 text-[#6f9ae3] transition-transform group-open:rotate-90" size={17} aria-hidden="true" /></div>
            </summary>
            <div className="bg-[#f8fbff] px-5 py-4 sm:px-6">{item.version && <StatusBadge tone="neutral">{item.version}</StatusBadge>}<p className="mt-2 text-sm leading-6 text-[#516783]">{item.context}</p><button type="button" className="mt-3 inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[#bfd7f7] bg-white px-3 text-xs font-bold text-[#4f7fca] transition-colors hover:bg-[#edf5ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f8df7]">{item.actionLabel}<ArrowRight size={14} aria-hidden="true" /></button></div>
          </details>
        ))}
      </div>
    </section>
  );
}

function TodayScheduleTable() {
  const [expandedSession, setExpandedSession] = useState<string | null>(null);
  return (
    <section id="schedule" aria-labelledby="schedule-title" className={panelClass}>
      <SectionHeader title="Lịch tour hôm nay" description="Thông tin Visitor được rút gọn theo nguyên tắc tối thiểu dữ liệu cá nhân." action={<span className="hidden text-[11px] font-medium text-[#8090a6] sm:block">3 Tour Session</span>} />
      <div className="overflow-x-auto"><table className="w-full min-w-[820px] border-collapse text-left text-sm"><thead className="border-y border-[#edf2fa] bg-[#f8fbff] text-[10px] font-bold text-[#6f8098] uppercase"><tr><th scope="col" className="px-6 py-3">Thời gian</th><th scope="col" className="px-4 py-3">Visitor / Booking</th><th scope="col" className="px-4 py-3">Route</th><th scope="col" className="px-4 py-3">Session</th><th scope="col" className="px-4 py-3">AMR</th><th scope="col" className="px-4 py-3">Trạng thái</th><th scope="col" className="px-6 py-3 text-right">Chi tiết</th></tr></thead><tbody className="divide-y divide-[#edf2fa]">{todaySchedule.map((tour) => <TourScheduleRows key={tour.id} tour={tour} expanded={expandedSession === tour.session} onToggle={() => setExpandedSession((current) => current === tour.session ? null : tour.session)} />)}</tbody></table></div>
    </section>
  );
}

function TourScheduleRows({ tour, expanded, onToggle }: { tour: TourScheduleRecord; expanded: boolean; onToggle: () => void }) {
  return <><tr className="transition-colors hover:bg-[#f8fbff]"><td className="px-6 py-3.5 font-bold text-[#40546f]">{tour.time}</td><td className="px-4 py-3.5"><span className="block font-semibold text-[#40546f]">{tour.visitorSummary}</span><span className="mt-0.5 block text-xs text-[#8a98ac]">{tour.id}</span></td><td className="px-4 py-3.5 text-[#647793]">{tour.route}</td><td className="px-4 py-3.5 font-medium text-[#647793]">{tour.session}</td><td className="px-4 py-3.5 text-[#647793]">{tour.amr}</td><td className="px-4 py-3.5"><StatusBadge tone={tourTone[tour.status]} icon={tour.status === 'Đang hoạt động' ? <Radio size={13} aria-hidden="true" /> : <Clock3 size={13} aria-hidden="true" />}>{tour.status}</StatusBadge></td><td className="px-6 py-3.5 text-right"><button type="button" onClick={onToggle} aria-expanded={expanded} className="inline-flex min-h-8 items-center gap-1 rounded-lg px-2 text-xs font-bold text-[#4f7fca] hover:bg-[#edf5ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f8df7]">Xem<ChevronRight className={`transition-transform ${expanded ? 'rotate-90' : ''}`} size={15} aria-hidden="true" /></button></td></tr>{expanded && <tr><td colSpan={7} className="bg-[#f8fbff] px-6 py-4 text-sm text-[#516783]"><div className="flex flex-wrap items-center gap-x-6 gap-y-2"><span><strong className="text-[#40546f]">Booking:</strong> {tour.id}</span><span><strong className="text-[#40546f]">Tour Session:</strong> {tour.session}</span><span><strong className="text-[#40546f]">Assignment:</strong> {tour.amr}</span><span><strong className="text-[#40546f]">Route version:</strong> v1</span></div></td></tr>}</>;
}

export default function AdminDashboard() {
  return (
    <div className="min-h-full bg-[#f1f6fe] px-4 py-5 font-sans text-[#1f314d] sm:px-6 lg:px-8 lg:py-7">
      <div className="mx-auto w-full max-w-[1500px]">
        <header className="mb-5 flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div><p className="text-xs font-bold text-[#5b91ed]">Thứ Ba, 15/09/2026</p><h2 className="mt-1 text-2xl font-bold tracking-[-0.04em] text-[#1f314d] sm:text-[28px]">Chào mừng trở lại, BayFi!</h2><p className="mt-1 text-sm text-[#71819a]">Tất cả hệ thống hoạt động bình thường. 1 AMR đang trực tuyến.</p></div>
          <div className="flex items-center gap-2 self-start lg:self-auto"><span className="inline-flex items-center gap-1.5 rounded-full border border-[#cce1ff] bg-[#eaf4ff] px-3 py-2 text-xs font-bold text-[#4f7fca]"><Sparkles size={14} aria-hidden="true" />Dữ liệu mô phỏng</span><button type="button" className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-[#5b91ed] px-4 text-xs font-bold text-white shadow-[0_5px_14px_rgba(79,141,247,0.22)] transition-colors hover:bg-[#407bd8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f8df7] focus-visible:ring-offset-2"><Bot size={14} aria-hidden="true" />AMR-01</button></div>
        </header>
        <OperationalSummary />
        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.03fr)_minmax(0,1.03fr)_minmax(300px,.94fr)]"><RobotOverview /><RobotListPanel /><AttentionPanel /></div>
        <div className="mt-4 grid gap-4 xl:grid-cols-2"><CurrentTourPanel /><PendingActionsPanel /></div>
        <div className="mt-4"><TodayScheduleTable /></div>
        <footer className="mt-5 flex flex-col gap-2 border-t border-[#dbe9fa] py-4 text-xs text-[#73849b] sm:flex-row sm:items-center sm:justify-between"><p className="flex items-center gap-1.5"><ShieldCheck size={14} aria-hidden="true" />Academic prototype trong khu vực vận hành được kiểm soát.</p><p className="flex items-center gap-1.5"><CalendarDays size={14} aria-hidden="true" />Dữ liệu Admin Summary API sẽ thay thế fixture khi sẵn sàng.</p></footer>
      </div>
    </div>
  );
}
