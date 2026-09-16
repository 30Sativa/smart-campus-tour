import { BatteryMedium, Bot, MapPin, Radio, Wifi, WifiOff } from 'lucide-react'
import { useOpsAmrs } from '../../features/operations/operations-hooks'
import { ErrorPanel, LoadingPanel, PageHeader, panelClass, StatusPill } from '../../features/operations/OperationsUi'
import { formatBattery, formatDateTime } from '../../features/operations/formatters'

const connectionHelp = 'Live là telemetry còn mới, Stale là dữ liệu cũ, Disconnected là mất tín hiệu. Robot Stale/Disconnected không được hiển thị như đang khỏe mạnh.'

export default function AmrPage() {
  const amrs = useOpsAmrs()
  return <div className="min-h-full bg-[#f1f6fe] px-4 py-5 sm:px-6 lg:px-8 lg:py-7"><div className="mx-auto w-full max-w-[1500px]">
    <PageHeader icon={<Bot size={14} />} title="Theo dõi AMR" description={connectionHelp} />
    {amrs.isPending ? <LoadingPanel /> : amrs.isError ? <ErrorPanel error={amrs.error} /> : amrs.data.length === 0 ? <div className="rounded-2xl border border-dashed border-[#cddbf1] bg-white p-10 text-center text-sm font-medium text-[#8a98ac]">Chưa có dữ liệu AMR từ máy chủ.</div> : <div className="grid gap-4 lg:grid-cols-2">
      {amrs.data.map((amr) => <section key={amr.id} className={panelClass}>
        <div className="flex items-center justify-between border-b border-[#edf2fa] px-5 py-4"><div><h3 className="font-bold text-[#40546f]">{amr.name}</h3><p className="mt-0.5 text-xs text-[#8a98ac]">{amr.currentSessionId ? `Phiên ${amr.currentSessionId.slice(0, 8)} · ${amr.currentSessionStatus || ''}` : 'Không gắn với phiên tour'}</p></div>{amr.connectionState === 'Live' ? <Radio size={18} className="text-[#25895f]" /> : amr.connectionState === 'Stale' ? <Wifi size={18} className="text-[#a96d0b]" /> : <WifiOff size={18} className="text-[#c95042]" />}</div>
        <div className="grid gap-3 p-5 text-sm">
          <div className="flex flex-wrap items-center gap-2"><StatusPill value={amr.connectionState} /><StatusPill value={amr.operationalState} />{amr.currentMissionState && <StatusPill value={amr.currentMissionState} />}<span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold ${amr.batteryPercent != null && amr.batteryPercent < 20 ? 'border-[#f5c8c2] bg-[#fff1ef] text-[#c95042]' : 'border-[#dbe6f4] bg-[#f6f9fd] text-[#647793]'}`}><BatteryMedium size={14} />{formatBattery(amr.batteryPercent)}</span></div>
          <div className="grid grid-cols-2 gap-3 rounded-xl bg-[#f8fbff] p-3 text-xs"><span><span className="block text-[#8a98ac]">Tuổi telemetry</span><span className="font-semibold text-[#40546f]">{amr.telemetryAgeSeconds == null ? 'Không có' : `${amr.telemetryAgeSeconds.toFixed(0)}s`}</span></span><span><span className="block text-[#8a98ac]">Cảm biến</span><span className="font-semibold text-[#40546f]">{amr.sensorHealth}</span></span><span><span className="block text-[#8a98ac]">Cập nhật cuối</span><span className="font-semibold text-[#40546f]">{formatDateTime(amr.lastSeenAt)}</span></span><span><span className="block text-[#8a98ac]">POI hiện tại</span><span className="font-semibold text-[#40546f]">{amr.currentPoi || 'Chưa có'}</span></span></div>
          <div className="flex items-center gap-2 text-xs text-[#71819a]"><MapPin size={14} />{amr.latitude != null && amr.longitude != null ? `${amr.latitude.toFixed(4)}, ${amr.longitude.toFixed(4)}` : 'Không có tọa độ'}</div>
        </div>
      </section>)}</div>}
  </div></div>
}
