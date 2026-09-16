import type { ReactNode } from 'react'

type Series = { label: string; value: number; color: string }

function ChartFrame({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <section className="rounded-2xl border border-[#dce9fb] bg-white shadow-[0_10px_28px_rgba(51,93,156,0.05)]"><div className="border-b border-[#edf2fa] px-5 py-4"><h3 className="font-bold text-[#40546f]">{title}</h3><p className="mt-0.5 text-xs text-[#8a98ac]">{description}</p></div>{children}</section>
}

export function TourVolumeChart() {
  const bars = [{ label: '08h', value: 2 }, { label: '09h', value: 5 }, { label: '10h', value: 7 }, { label: '11h', value: 4 }, { label: '13h', value: 6 }, { label: '14h', value: 8 }, { label: '15h', value: 5 }, { label: '16h', value: 3 }]
  const max = Math.max(...bars.map((item) => item.value))
  return <ChartFrame title="Nhịp tour trong ngày" description="Số phiên theo khung giờ — hỗ trợ chuẩn bị AMR và nhân sự."><div className="p-5"><div className="flex h-44 items-end gap-2 sm:gap-3">{bars.map((item) => <div key={item.label} className="flex min-w-0 flex-1 flex-col items-center gap-2"><span className="text-xs font-bold text-[#4f7fca]">{item.value}</span><div className="flex h-28 w-full items-end rounded-t-lg bg-[#f1f6fe]"><div className="w-full rounded-t-lg bg-[#5b91ed] transition-[height]" style={{ height: `${(item.value / max) * 100}%` }} /></div><span className="text-[10px] font-semibold text-[#8a98ac]">{item.label}</span></div>)}</div></div></ChartFrame>
}

export function TourOutcomeChart() {
  const points = [5, 6, 4, 7, 8, 6, 9]
  const width = 320
  const height = 120
  const x = (index: number) => 16 + index * ((width - 32) / (points.length - 1))
  const y = (value: number) => height - 16 - (value / 10) * (height - 32)
  const line = points.map((point, index) => `${x(index)},${y(point)}`).join(' ')
  return <ChartFrame title="Tour hoàn tất · 7 ngày" description="Xu hướng hoàn tất để theo dõi năng lực vận hành."><div className="p-5"><div className="flex items-center justify-between"><span className="text-2xl font-extrabold tracking-[-0.05em] text-[#1f314d]">45</span><span className="rounded-full bg-[#effbf5] px-2.5 py-1 text-[11px] font-bold text-[#25895f]">+12% so với tuần trước</span></div><svg viewBox={`0 0 ${width} ${height}`} className="mt-3 h-32 w-full" role="img" aria-label="Biểu đồ tour hoàn tất trong bảy ngày"><defs><linearGradient id="tour-outcome" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#5b91ed" stopOpacity="0.28" /><stop offset="100%" stopColor="#5b91ed" stopOpacity="0" /></linearGradient></defs>{[30, 60, 90].map((lineY) => <line key={lineY} x1="16" x2={width - 16} y1={lineY} y2={lineY} stroke="#e8f0fb" strokeDasharray="3 4" />)}<polygon points={`16,${height - 16} ${line} ${width - 16},${height - 16}`} fill="url(#tour-outcome)" /><polyline points={line} fill="none" stroke="#4f7fca" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />{points.map((point, index) => <circle key={index} cx={x(index)} cy={y(point)} r="3.5" fill="white" stroke="#4f7fca" strokeWidth="2" />)}</svg><div className="grid grid-cols-7 text-center text-[10px] font-semibold text-[#8a98ac]">{['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map((day) => <span key={day}>{day}</span>)}</div></div></ChartFrame>
}

export function DistributionChart({ title, description, series }: { title: string; description: string; series: Series[] }) {
  const total = series.reduce((sum, item) => sum + item.value, 0)
  const segments = series.map((item, index) => {
    const portion = total ? (item.value / total) * 100 : 0
    const offset = total
      ? series.slice(0, index).reduce((sum, previous) => sum + (previous.value / total) * 100, 0)
      : 0
    return { ...item, offset, portion }
  })
  return <ChartFrame title={title} description={description}><div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center"><div className="relative mx-auto grid h-36 w-36 shrink-0 place-items-center rounded-full" style={{ background: `conic-gradient(${segments.map((item) => `${item.color} ${item.offset}% ${item.offset + item.portion}%`).join(', ')})` }}><div className="grid h-24 w-24 place-items-center rounded-full bg-white text-center"><strong className="text-2xl font-extrabold tracking-[-0.05em] text-[#1f314d]">{total}</strong><span className="text-[10px] font-semibold text-[#8a98ac]">Tổng số</span></div></div><div className="min-w-0 flex-1 space-y-3">{series.map((item) => <div key={item.label} className="flex items-center justify-between gap-3"><span className="flex min-w-0 items-center gap-2 text-xs font-semibold text-[#647793]"><i className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />{item.label}</span><span className="text-xs font-extrabold text-[#40546f]">{item.value}</span></div>)}</div></div></ChartFrame>
}

export function RatingChart({ ratings }: { ratings: Array<number | null | undefined> }) {
  const counts = [5, 4, 3, 2, 1].map((rating) => ({ rating, value: ratings.filter((value) => value === rating).length }))
  const highest = Math.max(1, ...counts.map((item) => item.value))
  const total = counts.reduce((sum, item) => sum + item.value, 0)
  const average = total ? counts.reduce((sum, item) => sum + item.rating * item.value, 0) / total : 0
  return <ChartFrame title="Phân bố đánh giá" description="Chỉ gồm phản hồi đã có điểm sao."><div className="p-5"><div className="mb-5 flex items-end gap-2"><strong className="text-3xl font-extrabold tracking-[-0.06em] text-[#1f314d]">{average.toFixed(1)}</strong><span className="pb-1 text-xs font-semibold text-[#8a98ac]">/ 5 · {total} phản hồi</span></div><div className="space-y-3">{counts.map((item) => <div key={item.rating} className="grid grid-cols-[38px_1fr_22px] items-center gap-3"><span className="text-xs font-bold text-[#647793]">{item.rating} sao</span><div className="h-2.5 overflow-hidden rounded-full bg-[#edf2fa]"><div className="h-full rounded-full bg-[#f1b84b]" style={{ width: `${(item.value / highest) * 100}%` }} /></div><span className="text-right text-xs font-bold text-[#40546f]">{item.value}</span></div>)}</div></div></ChartFrame>
}
