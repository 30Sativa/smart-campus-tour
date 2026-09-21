import { useEffect, useState } from 'react'
import { DigitalTwinCanvas } from '../../three/DigitalTwinCanvas'
import { panelClass } from '../staff/StaffUi'
import { DEMO_DURATION, DEMO_SPEED, demoPose } from './demo-motion'

const buttonClass = 'rounded-lg border border-[#dce9fb] bg-white px-3 py-2 text-sm font-semibold text-[#40546f] hover:bg-[#eaf4ff] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4f8df7]'

export function SimulatorPreview() {
  const [playing, setPlaying] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [speed, setSpeed] = useState(1)
  const [overhead, setOverhead] = useState(false)

  useEffect(() => {
    if (!playing) return
    let previous = performance.now()
    const timer = window.setInterval(() => {
      const now = performance.now()
      const elapsed = Math.min((now - previous) / 1000, 0.25)
      previous = now
      if (!document.hidden) setSeconds((value) => (value + elapsed * speed) % DEMO_DURATION)
    }, 100)
    return () => window.clearInterval(timer)
  }, [playing, speed])

  const pose = demoPose(seconds)
  return <section className={`${panelClass} mb-5 overflow-hidden`} aria-label="Bản xem trước simulator">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#edf2fa] px-5 py-4">
      <div><div className="flex flex-wrap items-center gap-2"><h2 className="font-bold text-[#1f314d]">Khuôn viên mô phỏng</h2><span className="rounded-full bg-[#eaf4ff] px-2.5 py-1 text-xs font-semibold text-[#2f62b8]">Dữ liệu demo · Chưa kết nối robot</span></div><p className="mt-1 text-xs text-[#71819a]">Bản đồ 3D của bạn, với robot chạy theo tuyến demo.</p></div>
      <button className={buttonClass} onClick={() => setOverhead((value) => !value)}>{overhead ? 'Góc nhìn 3D' : 'Nhìn từ trên'}</button>
    </div>
    <div className="grid lg:grid-cols-[minmax(0,1fr)_260px]">
      <div><DigitalTwinCanvas pose={pose} overhead={overhead} /><p className="border-t border-[#dce9fb] px-5 py-3 text-xs text-[#71819a]">Kéo để xoay · Cuộn để thu phóng · Chuột phải để di chuyển góc nhìn</p></div>
      <aside className="border-t border-[#dce9fb] bg-[#f8fbff] p-5 lg:border-t-0 lg:border-l">
        <p className="text-xs font-semibold uppercase tracking-wider text-[#71819a]">Robot minh họa</p><h3 className="mt-2 text-xl font-bold text-[#1f314d]">robot_01</h3>
        <p className="mt-2 text-sm text-[#2f62b8]">{playing ? 'Đang phát chuyển động' : 'Đã tạm dừng'}</p>
        <dl className="mt-6 space-y-4 text-sm text-[#40546f]">
          <div className="flex justify-between"><dt>Vị trí X</dt><dd className="font-mono" data-testid="pose-x">{pose.x.toFixed(2)} m</dd></div>
          <div className="flex justify-between"><dt>Vị trí Y</dt><dd className="font-mono" data-testid="pose-y">{pose.y.toFixed(2)} m</dd></div>
          <div className="flex justify-between"><dt>Hướng robot</dt><dd className="font-mono">{((pose.yaw * 180 / Math.PI + 360) % 360).toFixed(0)}°</dd></div>
          <div className="flex justify-between"><dt>Tốc độ demo</dt><dd className="font-mono">{playing ? DEMO_SPEED.toFixed(1) : '0.0'} m/s</dd></div>
        </dl>
        <div className="mt-6 border-t border-[#dce9fb] pt-4"><p className="text-xs font-semibold text-[#71819a]">Tiến trình một vòng</p><progress className="mt-2 h-2 w-full accent-[#2f62b8]" aria-label="Tiến trình tuyến demo" value={seconds} max={DEMO_DURATION} /><p className="mt-2 text-xs tabular-nums text-[#71819a]">{seconds.toFixed(1)} / {DEMO_DURATION.toFixed(1)} giây</p></div>
        <p className="mt-6 text-xs leading-relaxed text-[#71819a]">Map 3D đã được căn tỉ lệ để xem trước. Robot và tuyến chạy là demo; tọa độ chưa được hiệu chỉnh với bản đồ robot thật. Tuyến demo chưa kiểm tra va chạm với map.</p>
      </aside>
    </div>
    <div className="flex flex-wrap items-center gap-3 border-t border-[#dce9fb] px-5 py-4">
      <button className={`${buttonClass} !border-[#2f62b8] !bg-[#2f62b8] !text-white`} onClick={() => setPlaying((value) => !value)}>{playing ? 'Tạm dừng demo' : 'Phát demo'}</button>
      <button className={buttonClass} onClick={() => { setPlaying(false); setSeconds(0) }}>Đặt lại</button>
      <label className="flex items-center gap-2 text-sm text-[#40546f]">Tốc độ phát<select className={buttonClass} value={speed} onChange={(event) => setSpeed(Number(event.target.value))}><option value={0.5}>0.5×</option><option value={1}>1×</option><option value={2}>2×</option></select></label>
      <p className="text-xs text-[#71819a] lg:ml-auto">Điều khiển bản xem trước trên trình duyệt.</p>
    </div>
  </section>
}
