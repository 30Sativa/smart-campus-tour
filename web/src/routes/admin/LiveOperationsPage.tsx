import { useState } from 'react';
import { Activity, MapPin, Navigation, Radio, Wifi, Video, Filter } from 'lucide-react';
import { StatusBadge } from '../../features/admin-dashboard/StatusBadge';

const panelClass = 'rounded-2xl border border-[#dce9fb] bg-white shadow-[0_10px_30px_rgba(69,112,167,0.07)]';

function PanelHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-[#edf2fa] px-4 py-3">
      <h2 className="text-[11px] font-bold tracking-[0.05em] text-[#6e84a2] uppercase">{title}</h2>
      {action}
    </div>
  );
}

function StatRow({ label, value, valueClass = 'text-[#1f314d]' }: { label: string; value: React.ReactNode; valueClass?: string }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-xs font-medium text-[#71819a]">{label}</span>
      <span className={`text-sm font-bold ${valueClass}`}>{value}</span>
    </div>
  );
}

function SystemStatusItem({ label, status }: { label: string; status: 'Normal' | 'Warning' | 'Error' }) {
  const dotColor = status === 'Normal' ? 'bg-[#39c490]' : status === 'Warning' ? 'bg-[#e5aa47]' : 'bg-[#ed7b6c]';
  const textColor = status === 'Normal' ? 'text-[#299b70]' : status === 'Warning' ? 'text-[#d38b16]' : 'text-[#d85c4b]';
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-xs font-medium text-[#71819a]">{label}</span>
      <div className="flex items-center gap-1.5">
        <span className={`h-2 w-2 rounded-full ${dotColor} shadow-[0_0_0_2px_rgba(255,255,255,1)]`} />
        <span className={`text-[11px] font-bold ${textColor}`}>{status}</span>
      </div>
    </div>
  );
}

function CampusRouteMap() {
  return (
    <div className="relative h-full w-full overflow-hidden rounded-b-2xl bg-[#f7fbff] bg-[linear-gradient(rgba(91,145,237,0.09)_1px,transparent_1px),linear-gradient(90deg,rgba(91,145,237,0.09)_1px,transparent_1px)] bg-[size:25px_25px]" aria-label="Bản đồ mô phỏng">
      <div className="absolute inset-x-[10%] top-[45%] h-1.5 rotate-[-8deg] rounded-full bg-[#bfd7f7]" aria-hidden="true" />
      <div className="absolute top-[25%] right-[13%] left-[32%] h-1.5 rotate-[18deg] rounded-full bg-[#bfd7f7]" aria-hidden="true" />
      <div className="absolute top-[52%] left-[8%] flex items-center gap-2 text-sm font-semibold text-[#5f7695]">
        <span className="grid h-8 w-8 place-items-center rounded-lg border border-[#d5e4f7] bg-white text-[#6c8dba]"><MapPin size={18} strokeWidth={1.9} /></span>Điểm xuất phát
      </div>
      <div className="absolute top-[35%] left-[42%] flex items-center gap-2 text-sm font-semibold text-[#5f7695]">
        <span className="grid h-8 w-8 place-items-center rounded-lg border border-[#b9d4fa] bg-[#eff6ff] text-[#4f8df7]"><MapPin size={18} strokeWidth={1.9} /></span>POI-02
      </div>
      <div className="absolute top-[12%] right-[8%] flex items-center gap-2 text-sm font-semibold text-[#5f7695]">
        <span className="grid h-8 w-8 place-items-center rounded-lg border border-[#d5e4f7] bg-white text-[#6c8dba]"><MapPin size={18} strokeWidth={1.9} /></span>Điểm kết thúc
      </div>
      <div className="absolute top-[41%] left-[30%] flex flex-col items-center gap-1">
        <div className="flex items-center gap-2 rounded-xl bg-[#5b91ed] px-3 py-2 text-sm font-bold text-white shadow-[0_8px_18px_rgba(79,141,247,0.28)]">
          <Navigation size={18} fill="currentColor" strokeWidth={1.8} />AMR-01
        </div>
        <span className="rounded bg-white/80 px-2 py-0.5 text-[10px] font-bold text-[#5b91ed]">Navigating</span>
      </div>
      <div className="absolute top-[20%] right-[30%] flex flex-col items-center gap-1">
        <div className="flex items-center gap-2 rounded-xl border border-[#d5e4f7] bg-white px-3 py-2 text-sm font-bold text-[#40546f] shadow-sm opacity-80">
          <Navigation size={18} strokeWidth={1.8} />AMR-02
        </div>
        <span className="rounded bg-white/80 px-2 py-0.5 text-[10px] font-bold text-[#e5aa47]">Charging</span>
      </div>
    </div>
  );
}

export default function LiveOperationsPage() {
  const [activeTab, setActiveTab] = useState('map');

  return (
    <div className="h-[calc(100vh-64px)] overflow-y-auto xl:overflow-hidden bg-[#f1f6fe] px-4 py-4 font-sans text-[#1f314d] sm:px-6">
      <div className="mx-auto flex min-h-full max-w-[1600px] flex-col gap-4">
        
        {/* Header */}
        <header className="flex shrink-0 items-end justify-between">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-bold text-[#5b91ed] uppercase tracking-wider mb-1">
              <Activity size={14} /> Vận hành
            </div>
            <h1 className="text-2xl font-bold tracking-[-0.04em] text-[#1f314d]">Live Twin Dashboard</h1>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge tone="success" icon={<Radio size={13} strokeWidth={2} />}>Live</StatusBadge>
            <StatusBadge tone="warning" icon={<Wifi size={13} strokeWidth={2} />}>Local Network</StatusBadge>
            <div className="flex h-8 items-center rounded-lg border border-[#cce1ff] bg-white p-1 text-xs font-bold text-[#4f7fca]">
              <span className="px-2">12:48:22</span>
            </div>
          </div>
        </header>

        {/* 3 Columns Layout */}
        <div className="grid flex-1 gap-4 xl:overflow-hidden xl:grid-cols-[200px_minmax(0,1fr)_240px]">
          
          {/* Left Sidebar */}
          <div className="flex flex-col gap-4 overflow-y-auto pr-1 pb-1">
            
            <section className={panelClass}>
              <PanelHeader title="Fleet Overview" action={<span className="text-[10px] font-bold text-[#5b91ed] cursor-pointer hover:underline">Robot list &rarr;</span>} />
              <div className="p-4 flex flex-col gap-1">
                <StatRow label="Tổng số Robot" value="2" valueClass="text-lg text-[#1f314d]" />
                <StatRow label="Đang chạy (Active)" value="1" valueClass="text-[#39c490]" />
                <StatRow label="Đang sạc (Charging)" value="1" valueClass="text-[#e5aa47]" />
                <StatRow label="Rỗi (Idle)" value="0" />
                <StatRow label="Lỗi (Error)" value="0" valueClass="text-[#ed7b6c]" />
              </div>
            </section>

            <section className={panelClass}>
              <PanelHeader title="Task Overview" />
              <div className="p-4 flex flex-col gap-1">
                <StatRow label="Nhiệm vụ đang chạy" value="1" />
                <StatRow label="Hoàn thành hôm nay" value="12" />
                <StatRow label="T.gian TB" value="18.5 min" />
                <StatRow label="Tỷ lệ đúng giờ" value="98.0%" valueClass="text-[#39c490]" />
                <StatRow label="Hiệu suất (Utilization)" value="76%" />
              </div>
            </section>

            <section className={panelClass}>
              <PanelHeader title="System Status" />
              <div className="p-4 flex flex-col gap-1">
                <SystemStatusItem label="Web Server" status="Normal" />
                <SystemStatusItem label="AMFleet API" status="Normal" />
                <SystemStatusItem label="Navigation" status="Normal" />
                <SystemStatusItem label="CCTV / Vision" status="Normal" />
                <SystemStatusItem label="Database" status="Normal" />
              </div>
            </section>

            <section className={`${panelClass} flex-1 min-h-[120px]`}>
              <PanelHeader title="Alerts" />
              <div className="p-4 flex h-full items-center justify-center text-xs font-medium text-[#8a98ac]">
                Không có cảnh báo.
              </div>
            </section>

          </div>

          {/* Center Column */}
          <div className="flex flex-col gap-4 overflow-hidden">
            
            {/* Main Map */}
            <section className={`${panelClass} flex flex-1 flex-col overflow-hidden relative`}>
              <div className="absolute left-4 top-4 z-10 flex gap-1 rounded-lg bg-white/80 p-1 backdrop-blur shadow-sm border border-white/50">
                <button onClick={() => setActiveTab('3d')} className={`rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${activeTab === '3d' ? 'bg-[#5b91ed] text-white' : 'text-[#6e84a2] hover:bg-[#edf5ff]'}`}>3D VIEW</button>
                <button onClick={() => setActiveTab('map')} className={`rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${activeTab === 'map' ? 'bg-[#5b91ed] text-white' : 'text-[#6e84a2] hover:bg-[#edf5ff]'}`}>MAP VIEW</button>
                <button onClick={() => setActiveTab('traffic')} className={`rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${activeTab === 'traffic' ? 'bg-[#5b91ed] text-white' : 'text-[#6e84a2] hover:bg-[#edf5ff]'}`}>TRAFFIC VIEW</button>
                <button onClick={() => setActiveTab('heatmap')} className={`rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${activeTab === 'heatmap' ? 'bg-[#5b91ed] text-white' : 'text-[#6e84a2] hover:bg-[#edf5ff]'}`}>HEATMAP</button>
              </div>
              
              <div className="absolute right-4 top-4 z-10">
                <button className="flex items-center gap-1 rounded-lg border border-[#cce1ff] bg-white px-3 py-1.5 text-xs font-bold text-[#4f7fca] shadow-sm hover:bg-[#eaf4ff]">
                  <Filter size={14} /> Tất cả tầng
                </button>
              </div>

              <CampusRouteMap />
            </section>

            {/* Bottom Panel Grid */}
            <div className="grid h-auto lg:h-48 shrink-0 grid-cols-1 lg:grid-cols-3 gap-4">
              
              <section className={`${panelClass} col-span-1 flex flex-col`}>
                <PanelHeader title="Task Queue" action={<span className="text-[10px] font-bold text-[#5b91ed] cursor-pointer hover:underline">View All &rarr;</span>} />
                <div className="flex-1 overflow-auto p-0">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 bg-[#f8fbff] text-[#8a98ac] border-b border-[#edf2fa]">
                      <tr><th className="px-3 py-2 font-medium">Task ID</th><th className="px-3 py-2 font-medium">Type</th><th className="px-3 py-2 font-medium">Robot</th><th className="px-3 py-2 font-medium text-right">Status</th></tr>
                    </thead>
                    <tbody className="divide-y divide-[#edf2fa]">
                      <tr className="hover:bg-[#f8fbff]"><td className="px-3 py-2 font-bold text-[#40546f]">#T801</td><td className="px-3 py-2 text-[#647793]">Tour</td><td className="px-3 py-2 text-[#647793]">AMR-01</td><td className="px-3 py-2 text-right font-bold text-[#39c490]">In Progress</td></tr>
                      <tr className="hover:bg-[#f8fbff]"><td className="px-3 py-2 font-bold text-[#40546f]">#T802</td><td className="px-3 py-2 text-[#647793]">Charge</td><td className="px-3 py-2 text-[#647793]">AMR-02</td><td className="px-3 py-2 text-right font-bold text-[#39c490]">In Progress</td></tr>
                      <tr className="hover:bg-[#f8fbff]"><td className="px-3 py-2 font-bold text-[#40546f]">#T803</td><td className="px-3 py-2 text-[#647793]">Tour</td><td className="px-3 py-2 text-[#647793]">-</td><td className="px-3 py-2 text-right font-bold text-[#e5aa47]">Queued</td></tr>
                    </tbody>
                  </table>
                </div>
              </section>

              <section className={`${panelClass} col-span-1 flex flex-col`}>
                <PanelHeader title="Throughput (Today)" />
                <div className="flex-1 p-4 flex flex-col justify-end relative">
                  <div className="absolute top-4 left-4 flex gap-3 text-[10px] font-bold">
                    <span className="flex items-center gap-1 text-[#5b91ed]"><span className="h-1.5 w-1.5 rounded-full bg-[#5b91ed]" /> Hoàn thành</span>
                    <span className="flex items-center gap-1 text-[#a0aec0]"><span className="h-1.5 w-1.5 rounded-full bg-[#cbd5e1]" /> Mục tiêu</span>
                  </div>
                  <div className="absolute top-4 right-4 text-sm font-bold text-[#1f314d]">12 <span className="text-[10px] text-[#8a98ac] font-medium">/ 15</span></div>
                  {/* Mock Bar Chart */}
                  <div className="flex h-16 items-end justify-between gap-2 px-2 mt-auto">
                    {[30, 45, 20, 60, 80, 50, 90, 40].map((h, i) => (
                      <div key={i} className="w-full bg-[#eaf4ff] rounded-t-sm h-full relative group">
                        <div className="absolute bottom-0 w-full bg-[#5b91ed] rounded-t-sm" style={{ height: `${h}%` }}></div>
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              <section className={`${panelClass} col-span-1 flex flex-col`}>
                <PanelHeader title="Robot Status" />
                <div className="flex-1 flex items-center justify-center gap-6 p-4">
                  {/* Donut Chart Mock */}
                  <div className="relative grid h-20 w-20 place-items-center rounded-full bg-[conic-gradient(#39c490_0deg_180deg,#e5aa47_180deg_360deg)] before:absolute before:h-14 before:w-14 before:rounded-full before:bg-white shadow-sm">
                    <span className="relative text-center"><strong className="block text-lg leading-none tracking-[-0.04em] text-[#34517b]">2</strong><span className="block text-[8px] font-semibold text-[#8390a0]">Tổng</span></span>
                  </div>
                  <div className="flex flex-col gap-2 text-xs">
                    <span className="flex items-center gap-1.5 font-semibold text-[#39c490]"><span className="h-2 w-2 rounded-full bg-[#39c490]" /> Active <span className="text-[#1f314d]">1 (50%)</span></span>
                    <span className="flex items-center gap-1.5 font-semibold text-[#e5aa47]"><span className="h-2 w-2 rounded-full bg-[#e5aa47]" /> Charging <span className="text-[#1f314d]">1 (50%)</span></span>
                  </div>
                </div>
              </section>

            </div>
          </div>

          {/* Right Sidebar */}
          <div className="flex flex-col gap-4 overflow-y-auto pl-1 pb-1">
            
            <section className={`${panelClass} flex flex-col`}>
              <PanelHeader title="Selected Robot" action={<span className="text-[10px] font-medium text-[#8a98ac]">Nhấp vào 3D View</span>} />
              <div className="p-3">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-[#1f314d] flex items-center gap-2"><Navigation size={15} className="text-[#5b91ed]" /> AMR-01</h3>
                  <StatusBadge tone="success">Active</StatusBadge>
                </div>
                
                <div className="rounded-xl overflow-hidden bg-[#1f314d] relative h-32 mb-3 group border border-[#1f314d]">
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <button className="rounded-full bg-white/20 p-2 backdrop-blur hover:bg-white/30 text-white"><Video size={18} /></button>
                  </div>
                  {/* Mock camera feed */}
                  <div className="absolute top-2 left-2 flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-[8px] font-bold text-white uppercase"><Video size={10} /> Cam-F</div>
                  <div className="absolute top-2 right-2 flex items-center gap-1 rounded bg-[#ed7b6c] px-1.5 py-0.5 text-[8px] font-bold text-white uppercase"><Radio size={10} /> Live</div>
                  <img src="/smartbus-robot.jpg" alt="Robot camera" className="h-full w-full object-cover opacity-60 mix-blend-luminosity" />
                </div>
                
                <button className="w-full flex items-center justify-center gap-2 rounded-lg bg-[#5b91ed] py-2 text-xs font-bold text-white transition-colors hover:bg-[#407bd8]">
                  <Activity size={14} /> Analyze
                </button>
              </div>
            </section>

            <section className={`${panelClass} flex-1 flex flex-col`}>
              <PanelHeader title="Event Log" action={<span className="text-[10px] font-bold text-[#5b91ed] cursor-pointer hover:underline">View All &rarr;</span>} />
              <div className="flex-1 overflow-y-auto p-4 text-xs">
                <div className="relative border-l border-[#dce9fb] pl-4 pb-4">
                  <span className="absolute -left-1.5 top-1 h-3 w-3 rounded-full border-[3px] border-white bg-[#5b91ed]" />
                  <p className="font-bold text-[#8a98ac] text-[10px] mb-0.5">12:48:15</p>
                  <p className="font-semibold text-[#40546f]">AMR-01 reached POI-02</p>
                  <p className="text-[11px] text-[#71819a] mt-0.5">Navigation task updated (45m, 50%)</p>
                </div>
                <div className="relative border-l border-[#dce9fb] pl-4 pb-4">
                  <span className="absolute -left-1.5 top-1 h-3 w-3 rounded-full border-[3px] border-white bg-[#39c490]" />
                  <p className="font-bold text-[#8a98ac] text-[10px] mb-0.5">12:45:00</p>
                  <p className="font-semibold text-[#40546f]">Task #T801 created</p>
                  <p className="text-[11px] text-[#71819a] mt-0.5">Tour assigned to AMR-01</p>
                </div>
                <div className="relative border-l border-[#dce9fb] pl-4 pb-4">
                  <span className="absolute -left-1.5 top-1 h-3 w-3 rounded-full border-[3px] border-white bg-[#e5aa47]" />
                  <p className="font-bold text-[#8a98ac] text-[10px] mb-0.5">12:10:22</p>
                  <p className="font-semibold text-[#40546f]">AMR-02 low battery</p>
                  <p className="text-[11px] text-[#71819a] mt-0.5">Auto-routing to charging station</p>
                </div>
                <div className="relative pl-4 pb-0">
                  <span className="absolute -left-1.5 top-1 h-3 w-3 rounded-full border-[3px] border-white bg-[#cbd5e1]" />
                  <p className="font-bold text-[#8a98ac] text-[10px] mb-0.5">10:00:00</p>
                  <p className="font-semibold text-[#40546f]">System initialized</p>
                </div>
              </div>
            </section>

          </div>
        </div>

      </div>
    </div>
  );
}
