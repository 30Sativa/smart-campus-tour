import { useMemo, useState } from 'react'
import { RefreshCcw, Users } from 'lucide-react'
import type { AdminRegistration, RosterRow } from '../../../api/contracts/admin'
import { buttonClass } from '../../staff/ui-classes'
import { formatSlot, formatStamp } from '../admin-format'
import { rowClass, tdClass, thClass } from '../admin-classes'
import { SearchField } from '../../staff/StaffUi'
import { InvitationStatus, RegistrationStateBadge, TableFrame } from '../AdminUi'

/**
 * Group registrations. Registration state and the participation e-mail are
 * two separate columns because they are two separate facts (scope §3.4).
 * A row waiting for review is marked and offers "Xem & duyệt".
 */
export function AdminRegistrationTable({ registrations, onReview, showTour = false, label }: {
  registrations: AdminRegistration[]; onReview: (id: string) => void; showTour?: boolean; label: string
}) {
  return (
    <>
      <TableFrame label={label} wide={showTour}>
        <thead className="border-b border-[#efefe9] bg-[#f7f7f3]">
          <tr>
            <th scope="col" className={thClass}>Trường / đoàn</th>
            {showTour && <th scope="col" className={thClass}>Tour</th>}
            <th scope="col" className={thClass}>Đại diện · email liên hệ</th>
            <th scope="col" className={`${thClass} text-right`}>Học sinh</th>
            <th scope="col" className={thClass}>Trạng thái</th>
            <th scope="col" className={thClass}>Thông tin tham gia</th>
            <th scope="col" className={`${thClass} sticky right-0 bg-[#f7f7f3] text-right shadow-[-8px_0_12px_-10px_rgba(31,49,77,0.25)]`}>Thao tác</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#efefe9]">
          {registrations.map((reg) => {
            const waiting = reg.state === 'Submitted'
            return (
              <tr key={reg.id} className={waiting ? 'bg-[#fffbf2] shadow-[inset_3px_0_0_#e3a83b] transition-colors hover:bg-[#fff7e8]' : rowClass}>
                <td className={`${tdClass} min-w-44`}>
                  <p className="font-semibold text-[#1c1c1c]">{reg.schoolName}</p>
                  <p className="text-xs text-[#8e9096]">Gửi {formatStamp(reg.submittedAt)}</p>
                  {reg.resubmittedAfterApproval && <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-bold text-[#92400e]"><RefreshCcw size={11} aria-hidden="true" />Danh sách cập nhật, cần duyệt lại</p>}
                </td>
                {showTour && (
                  <td className={tdClass}>
                    <p className="max-w-48 truncate font-medium text-[#1c1c1c]" title={reg.tourName}>{reg.tourName}</p>
                    <p className="text-xs whitespace-nowrap text-[#8e9096]">{reg.tourCode} · {formatSlot(reg.tourScheduledAt)}</p>
                  </td>
                )}
                <td className={tdClass}>
                  <p className="whitespace-nowrap text-[#1c1c1c]">{reg.representativeName}</p>
                  <p className="text-xs whitespace-nowrap text-[#6b6e75]">{reg.contactEmail}</p>
                </td>
                <td className={`${tdClass} text-right tabular-nums`}>{reg.studentCount}</td>
                <td className={tdClass}><RegistrationStateBadge state={reg.state} /></td>
                <td className={`${tdClass} whitespace-nowrap`}><InvitationStatus registration={reg} /></td>
                {/* Pinned, so the action stays reachable when the table scrolls sideways on a laptop or tablet. */}
                <td className={`${tdClass} sticky right-0 text-right shadow-[-8px_0_12px_-10px_rgba(31,49,77,0.25)] ${waiting ? 'bg-[#fffbf2]' : 'bg-white'}`}>
                  <button type="button" onClick={() => onReview(reg.id)} className={buttonClass(waiting ? 'primary' : 'secondary', 'sm')}>{waiting ? 'Xem & duyệt' : 'Xem'}</button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </TableFrame>
      <ul className="divide-y divide-[#efefe9] md:hidden" aria-label={label}>
        {registrations.map((reg) => {
          const waiting = reg.state === 'Submitted'
          return (
            <li key={reg.id} className={`p-4 ${waiting ? 'bg-[#fffbf2]' : ''}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold text-[#1c1c1c]">{reg.schoolName}</p>
                  <p className="text-xs text-[#6b6e75]">{reg.representativeName}</p>
                </div>
                <RegistrationStateBadge state={reg.state} />
              </div>
              {showTour && <p className="mt-2 text-xs text-[#6b6e75]">{reg.tourCode} · {reg.tourName}</p>}
              <p className="mt-2 flex items-center gap-1.5 text-[13px] text-[#3a3d44]"><Users size={14} className="text-[#8e9096]" aria-hidden="true" />{reg.studentCount} học sinh, gửi {formatStamp(reg.submittedAt)}</p>
              <div className="mt-1.5"><InvitationStatus registration={reg} /></div>
              <button type="button" onClick={() => onReview(reg.id)} className={`${buttonClass(waiting ? 'primary' : 'secondary', 'sm')} mt-3 w-full`}>{waiting ? 'Xem & duyệt' : 'Xem'}</button>
            </li>
          )
        })}
      </ul>
    </>
  )
}

const fold = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').replace(/[đĐ]/g, 'd').toLowerCase()

/**
 * The roster as approved or submitted: STT, Họ tên, Lớp - nothing else
 * (scope §3.3: no phone, ID number, student code or attendance).
 */
export function RosterTable({ roster }: { roster: RosterRow[] }) {
  const [query, setQuery] = useState('')
  const rows = useMemo(() => {
    const q = fold(query.trim())
    return roster.map((row, index) => ({ ...row, index: index + 1 })).filter((row) => !q || fold(`${row.name} ${row.className ?? ''}`).includes(q))
  }, [roster, query])
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-bold text-[#1c1c1c]">Danh sách học sinh <span className="font-semibold text-[#6b6e75]">({query ? `${rows.length}/` : ''}{roster.length})</span></p>
        <SearchField value={query} onChange={setQuery} label="Tìm học sinh" placeholder="Tìm theo họ tên, lớp…" className="w-full sm:w-64" />
      </div>
      <div className="mt-3 max-h-80 overflow-y-auto rounded-xl border border-[#e3e3dc]">
        <table className="w-full text-left text-sm" aria-label="Danh sách học sinh">
          <thead className="sticky top-0 bg-[#f7f7f3]">
            <tr>
              <th scope="col" className={`${thClass} w-14`}>STT</th>
              <th scope="col" className={thClass}>Họ tên</th>
              <th scope="col" className={thClass}>Lớp</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#efefe9]">
            {rows.map((row) => (
              <tr key={row.index}>
                <td className="px-4 py-2 text-xs text-[#8e9096] tabular-nums">{row.index}</td>
                <td className="px-4 py-2 font-semibold text-[#1c1c1c]">{row.name}</td>
                <td className="px-4 py-2 text-[#3a3d44]">{row.className || <span className="text-[#8e9096]">-</span>}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={3} className="px-4 py-6 text-center text-sm text-[#8e9096]">Không có học sinh nào khớp “{query}”.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
