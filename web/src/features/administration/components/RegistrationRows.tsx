import { RefreshCcw, Send } from 'lucide-react'
import type { AdminRegistration } from '../../../api/contracts/admin'
import { buttonClass } from '../../../components/ui/ui-classes'
import { formatShortDay } from '../admin-format'
import { regStage } from '../registration-stage'

const AVATAR = [['#e0f2fe', '#0369a1'], ['#fef3c7', '#b45309'], ['#ede9fe', '#6d28d9'], ['#dcfce7', '#15803d'], ['#ffe4e6', '#be123c'], ['#e0e7ff', '#4338ca'], ['#ccfbf1', '#0f766e']]
const initials = (name: string) => name.replace(/^(THPT|THCS|Trường)\s+(Chuyên\s+|Quốc tế\s+)?/i, '').split(/\s+/).filter(Boolean).slice(-2).map((w) => w[0]).join('').toUpperCase()
const avatar = (name: string) => { let h = 0; for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return AVATAR[h % AVATAR.length] }
const hm = (value: string) => { const d = new Date(value); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }

/**
 * Registrations as one line each: who, which Tour, how many students, and
 * the single next step for the stage they are in.
 */
export function RegistrationRows({ registrations, onReview, onInvite, label }: {
  registrations: AdminRegistration[]; onReview: (id: string) => void; onInvite: (id: string) => void; label: string
}) {
  return (
    <ul className="px-3 pb-3" aria-label={label}>
      {registrations.map((reg) => {
        const stage = regStage(reg)
        const [bg, fg] = avatar(reg.schoolName)
        const review = stage === 'wait' && reg.tourState === 'Scheduled'
        const invite = stage === 'noinv' && reg.allowedActions.sendInvitation.allowed
        return (
          <li key={reg.id} className="grid grid-cols-[34px_minmax(0,1fr)_auto] items-center gap-x-3.5 gap-y-1 border-b border-[#f3f4f6] px-2 py-2.5 transition-colors last:border-0 hover:bg-[#f8f9fb] md:grid-cols-[34px_minmax(0,1fr)_150px_64px_160px] md:rounded-lg">
            <span aria-hidden="true" className="grid size-[34px] place-items-center rounded-[9px] text-[11.5px] font-bold" style={{ background: bg, color: fg }}>{initials(reg.schoolName)}</span>
            <span className="min-w-0">
              <b className="block truncate text-[13.5px] font-semibold text-[#111827]" title={reg.schoolName}>{reg.schoolName}</b>
              <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[#9ca3af]">
                <span className="truncate">{reg.representativeName}</span>
                {reg.resubmittedAfterApproval && stage === 'wait' && <span className="inline-flex items-center gap-1 rounded bg-[#fffbeb] px-1.5 text-[11px] font-semibold text-[#b45309]"><RefreshCcw size={10} aria-hidden="true" />Danh sách cập nhật</span>}
                {stage === 'wait' && reg.tourState !== 'Scheduled' && <span className="rounded bg-[#f3f4f6] px-1.5 text-[11px] font-semibold text-[#6b7280]">Tour đã chốt</span>}
                {stage === 'noinv' && reg.invitationFailed && <span className="rounded bg-[#fef2f2] px-1.5 text-[11px] font-semibold text-[#dc2626]">Gửi lỗi, cần gửi lại</span>}
              </span>
              {stage === 'rej' && reg.rejectionReason && <span className="mt-0.5 line-clamp-1 text-[11.5px] text-[#9d3428]">{reg.rejectionReason}</span>}
            </span>
            <span className="col-start-2 row-start-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[#9ca3af] md:col-start-auto md:row-start-auto">
              <span className="shrink-0 rounded bg-[#f3f4f6] px-1.5 font-mono text-[11px] font-semibold whitespace-nowrap text-[#6b7280]">{reg.tourCode}</span>
              <span className="whitespace-nowrap tabular-nums">{formatShortDay(reg.tourScheduledAt)} · {hm(reg.tourScheduledAt)}</span>
            </span>
            <span className="col-start-3 row-start-1 text-right text-xs text-[#9ca3af] md:col-start-auto md:row-start-auto"><b className="text-sm text-[#111827] tabular-nums">{reg.studentCount}</b> HS</span>
            <span className="col-start-3 row-start-2 flex justify-end md:col-start-auto md:row-start-auto">
              {review ? <button type="button" onClick={() => onReview(reg.id)} className={buttonClass('primary', 'sm')}>Xem & duyệt</button>
                : invite ? <button type="button" onClick={() => onInvite(reg.id)} className={buttonClass('secondary', 'sm')}><Send size={14} aria-hidden="true" />{reg.invitationFailed ? 'Gửi lại' : 'Gửi thông tin'}</button>
                : <button type="button" onClick={() => onReview(reg.id)} className={buttonClass('ghost', 'sm')}>Xem</button>}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
