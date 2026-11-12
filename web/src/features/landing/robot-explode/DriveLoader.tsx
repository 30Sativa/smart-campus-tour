import { useEffect, useState } from 'react'

const TIPS = [
  'W A S D hoặc phím mũi tên để lái, Space để phanh.',
  'Nhấn P để robot tự đi qua từng điểm dừng.',
  'Nhấn C để đổi máy quay: Chase, Điện ảnh, Trên cao.',
  'Nhấn N để chuyển ngày và đêm trên bản đồ khuôn viên.',
  'Máy chạy chậm? Chọn đồ họa Mượt trong phần cài đặt.',
]

/**
 * The test drive's loading screen: the robot scanning round itself, how much
 * of the map has arrived (`progress`, 0..100; without it, a bar that keeps
 * moving) and a driving tip every few seconds. `leaving` fades it out once
 * the map is ready. Light on purpose: it shows while the 3D code itself still
 * downloads.
 */
export function DriveLoader({ progress = null, leaving = false, label = 'Đang chuẩn bị khuôn viên' }: { progress?: number | null; leaving?: boolean; label?: string }) {
  const [tip, setTip] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => setTip(value => (value + 1) % TIPS.length), 3200)
    return () => window.clearInterval(id)
  }, [])
  const percent = progress === null ? null : Math.max(0, Math.min(100, Math.round(progress)))
  return (
    <div className="lp3-dl" data-leaving={leaving} role="status" aria-live="polite" aria-busy={!leaving}>
      <div className="lp3-dl__stage" aria-hidden="true">
        <span className="lp3-dl__ring" />
        <span className="lp3-dl__ring" />
        <span className="lp3-dl__ring" />
        <svg className="lp3-dl__robot" viewBox="0 0 120 150" fill="none">
          <ellipse cx="60" cy="140" rx="40" ry="6" fill="rgba(0,0,0,.35)" />
          <rect x="22" y="84" width="76" height="46" rx="8" fill="#eef2f4" />
          <rect x="22" y="112" width="76" height="18" rx="6" fill="#b9c6cd" />
          <rect x="66" y="94" width="22" height="9" rx="2" fill="#0b1519" />
          <circle cx="36" cy="132" r="9" fill="#1c262c" />
          <circle cx="84" cy="132" r="9" fill="#1c262c" />
          <rect x="51" y="40" width="18" height="46" rx="3" fill="#dde4e8" />
          <rect x="45" y="18" width="30" height="26" rx="10" fill="#eef2f4" />
          <rect x="44" y="24" width="32" height="10" rx="5" fill="#0b1519" />
          <rect className="lp3-dl__visor" x="47" y="27" width="10" height="4" rx="2" fill="#8fcf4a" />
        </svg>
        <span className="lp3-dl__scan" />
      </div>
      <p className="lp3-dl__kicker">CampusTour · lái thử robot</p>
      <p className="lp3-dl__title">{label}{percent === null ? '…' : ` · ${percent}%`}</p>
      <div className="lp3-dl__bar" data-indeterminate={percent === null}>
        <span style={percent === null ? undefined : { width: `${percent}%` }} />
      </div>
      <p className="lp3-dl__tip" key={tip}>{TIPS[tip]}</p>
    </div>
  )
}
