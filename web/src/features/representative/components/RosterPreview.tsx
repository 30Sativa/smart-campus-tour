import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import type { RosterRow } from '../../../api/contracts/representative'
import { inputClass } from '../../staff/ui-classes'

const fold = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').replace(/[đĐ]/g, 'd').toLowerCase()

/**
 * The roster as a table: STT, Họ tên, Lớp and nothing else (scope §3.3).
 * Scrolls inside its own box, sideways too on a narrow phone.
 */
export function RosterPreview({ rows, label = 'Danh sách học sinh', maxHeight = 'max-h-[360px]' }: { rows: RosterRow[]; label?: string; maxHeight?: string }) {
  const [q, setQ] = useState('')
  const searchable = rows.length > 12
  const shown = useMemo(() => {
    const all = rows.map((row, i) => ({ row, n: i + 1 }))
    const needle = fold(q.trim())
    return needle ? all.filter(({ row }) => fold(`${row.name} ${row.className ?? ''}`).includes(needle)) : all
  }, [rows, q])

  return (
    <div>
      {searchable && (
        <label className="relative mb-3 block sm:max-w-xs">
          <span className="sr-only">Tìm học sinh trong danh sách</span>
          <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[#94a3b8]" aria-hidden="true" />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm theo họ tên hoặc lớp" className={`${inputClass} pl-9`} />
        </label>
      )}
      <div className={`overflow-auto rounded-xl border border-[#e5e9f0] ${maxHeight}`}>
        <table className="w-full min-w-[420px] text-left text-sm" aria-label={label}>
          <thead className="sticky top-0 bg-[#f8fafc]">
            <tr className="text-xs text-[#64748b]">
              <th scope="col" className="w-16 px-4 py-2.5 font-medium">STT</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Họ tên</th>
              <th scope="col" className="w-32 px-4 py-2.5 font-medium">Lớp</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f1f5f9]">
            {shown.map(({ row, n }) => (
              <tr key={n}>
                <td className="px-4 py-2.5 text-[#94a3b8] tabular-nums">{n}</td>
                <td className="px-4 py-2.5 font-medium text-[#0f172a]">{row.name}</td>
                <td className="px-4 py-2.5 text-[#334155]">{row.className || <span className="text-[#94a3b8]">-</span>}</td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr><td colSpan={3} className="px-4 py-6 text-center text-[#64748b]">Không có học sinh khớp "{q}".</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {q && shown.length > 0 && <p className="mt-2 text-xs text-[#64748b]">{shown.length} / {rows.length} học sinh khớp</p>}
    </div>
  )
}
