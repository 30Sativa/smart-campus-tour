import { Check, Info, Minus, X } from 'lucide-react'
import type { TourStartCheck } from '../../administration/tours/types'
import { CHECK_GROUP_LABEL, checkInfo, checkVerdict, type CheckGroup, type CheckVerdict } from './operation-labels'

const ORDER: CheckGroup[] = ['tour', 'robot', 'telemetry', 'system', 'onsite', 'other']

const VERDICT: Record<CheckVerdict, { label: string; icon: typeof Check; className: string }> = {
  passed: { label: 'Đạt', icon: Check, className: 'bg-[#ecfdf3] text-[#15803d]' },
  failed: { label: 'Chưa đạt', icon: X, className: 'bg-[#fef2f2] text-[#dc2626]' },
  notRun: { label: 'Chưa kiểm tra', icon: Minus, className: 'bg-[#f1f5f9] text-[#64748b]' },
  info: { label: 'Thông tin', icon: Info, className: 'bg-[#eff6ff] text-[#2563eb]' },
}

/**
 * The server's Start (or movement) checks, grouped for reading. Every row shows
 * the backend's own detail. A check the server skipped because a prerequisite
 * failed reads "Chưa kiểm tra", so the operator fixes root causes first.
 */
export function StartCheckList({ checks, blockedBy }: { checks: TourStartCheck[]; blockedBy: readonly string[] }) {
  const groups = ORDER.map(group => ({ group, rows: checks.filter(check => checkInfo(check.id).group === group) })).filter(entry => entry.rows.length)
  return (
    <div className="space-y-4">
      {groups.map(({ group, rows }) => (
        <section key={group} aria-label={CHECK_GROUP_LABEL[group]}>
          <h3 className="mb-1.5 text-xs font-semibold text-[#64748b]">{CHECK_GROUP_LABEL[group]}</h3>
          <ul className="divide-y divide-[#f1f5f9] rounded-xl border border-[#e2e8f0]">
            {rows.map(check => {
              const verdict = checkVerdict(check, blockedBy)
              const { label, icon: Icon, className } = VERDICT[verdict]
              return (
                <li key={check.id} className="flex items-start gap-3 px-3 py-2.5" data-verdict={verdict}>
                  <span className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full ${className}`} title={label}>
                    <Icon size={12} strokeWidth={3} aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold text-[#0f172a]">{checkInfo(check.id).label}<span className="sr-only">: {label}</span></span>
                    <span className="block text-xs leading-5 text-[#64748b]">{check.detail}</span>
                  </span>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}
