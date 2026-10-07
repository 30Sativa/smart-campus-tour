import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import type { RosterRow } from '../api/types'

const fold = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').replace(/[đĐ]/g, 'd').toLowerCase()

/**
 * The roster as a table: source row, type, display name, email and optional class (Review 1).
 * Rows slide in on first show. Scrolls inside its own box, sideways too on a narrow phone.
 */
export function RosterPreview({ rows, label = 'Danh sách lời mời', maxHeight = 'max-h-[360px]' }: { rows: RosterRow[]; label?: string; maxHeight?: string }) {
  const [q, setQ] = useState('')
  const searchable = rows.length > 12
  const shown = useMemo(() => {
    const all = rows.map((row, i) => ({ row, n: i + 1 }))
    const needle = fold(q.trim())
    return needle ? all.filter(({ row }) => fold(`${row.displayName} ${row.email} ${row.className ?? ''}`).includes(needle)) : all
  }, [rows, q])

  return (
    <div>
      {searchable && (
        <label className="rep-search" style={{ marginBottom: 12, maxWidth: 360 }}>
          <span className="sr-only">Tìm dòng trong danh sách</span>
          <Search size={16} aria-hidden="true" className="rep-muted" />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm theo họ tên hoặc lớp" />
        </label>
      )}
      <div className={`rep-table-wrap ${maxHeight}`}>
        <table className="rep-table" aria-label={label}>
          <thead>
            <tr>
              <th scope="col" style={{ width: 64 }}>STT</th>
              <th scope="col">Họ tên</th>
              <th scope="col">Loại dòng</th><th scope="col">Email</th>
              <th scope="col" style={{ width: 120 }}>Lớp</th>
            </tr>
          </thead>
          <tbody>
            {shown.map(({ row, n }) => (
              <tr key={n} style={{ '--i': n } as React.CSSProperties}>
                <td className="rep-muted num">{row.rowNumber}</td>
                <td style={{ fontWeight: 650 }}>{row.displayName}</td>
                <td><span className={`rep-row-type ${row.rowType === 'INDIVIDUAL' ? 'rep-row-type--ind' : 'rep-row-type--shared'}`}>{row.rowType === 'INDIVIDUAL' ? 'Cá nhân' : 'Điểm xem chung'}</span></td><td>{row.email}</td>
                <td>{row.className || <span className="rep-muted">-</span>}</td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr><td colSpan={5} className="rep-muted" style={{ padding: 24, textAlign: 'center' }}>Không có dòng khớp "{q}".</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {q && shown.length > 0 && <p className="rep-hint" style={{ marginTop: 8 }}>{shown.length} / {rows.length} dòng khớp</p>}
    </div>
  )
}
