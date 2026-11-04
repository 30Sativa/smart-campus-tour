import { Check, ChevronDown, Info, Minus, X } from 'lucide-react'
import type { TourStartCheck } from '../../administration/tours/types'
import { CHECK_GROUP_LABEL, SYSTEM_GATES, checkInfo, checkVerdict, type CheckGroup, type CheckVerdict } from './operation-labels'

const ORDER: CheckGroup[] = ['tour', 'robot', 'telemetry', 'system', 'onsite', 'other']

const VERDICT: Record<CheckVerdict, { label: string; icon: typeof Check; className: string }> = {
  passed: { label: 'Đạt', icon: Check, className: 'bg-[#ecfdf3] text-[#15803d]' },
  failed: { label: 'Chưa đạt', icon: X, className: 'bg-[#fef2f2] text-[#dc2626]' },
  notRun: { label: 'Chưa kiểm tra', icon: Minus, className: 'bg-[#f1f5f9] text-[#64748b]' },
  info: { label: 'Thông tin', icon: Info, className: 'bg-[#eff6ff] text-[#2563eb]' },
}

/** What kind of blocker a root cause is, so the operator knows who can clear it. */
function blockerKind(id: string): { label: string; className: string } {
  if ((SYSTEM_GATES as readonly string[]).includes(id) || id === 'operatorConsoleConnected')
    return { label: 'Giới hạn hệ thống', className: 'bg-[#fffaf0] text-[#8a5a06] border-[#f1dcb0]' }
  if (id === 'callerIsOperator') return { label: 'Quyền', className: 'bg-[#f5f3ff] text-[#5b21b6] border-[#ddd6fe]' }
  if (id === 'withinStartWindow') return { label: 'Lịch', className: 'bg-[#eff6ff] text-[#1d4ed8] border-[#bfdbfe]' }
  return { label: CHECK_GROUP_LABEL[checkInfo(id).group], className: 'bg-[#f8fafc] text-[#475569] border-[#e2e8f0]' }
}

function VerdictIcon({ verdict }: { verdict: CheckVerdict }) {
  const { label, icon: Icon, className } = VERDICT[verdict]
  return <span className={`grid size-5 shrink-0 place-items-center rounded-full ${className}`} title={label}><Icon size={12} strokeWidth={3} aria-hidden="true" /></span>
}

/**
 * Only the root causes, each with the backend's detail and who can clear it.
 * Checks the server skipped because of them are folded into one line, so a
 * single stale telemetry report does not read as five problems.
 */
export function BlockerList({ checks, blockedBy }: { checks: TourStartCheck[]; blockedBy: readonly string[] }) {
  const failed = checks.filter(check => checkVerdict(check, blockedBy) === 'failed')
  const notRun = checks.filter(check => checkVerdict(check, blockedBy) === 'notRun')
  if (!failed.length) return <p className="text-[13px] font-semibold text-[#15803d]">Mọi điều kiện từ máy chủ đều đạt.</p>
  return (
    <div>
      <ul className="divide-y divide-[#f1f5f9]" aria-label="Nguyên nhân chưa bắt đầu được">
        {failed.map(check => {
          const kind = blockerKind(check.id)
          return <li key={check.id} className="flex items-start gap-3 py-2.5 first:pt-0" data-verdict="failed">
            <VerdictIcon verdict="failed" />
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-[13px] font-semibold text-[#0f172a]">{checkInfo(check.id).label}</span>
                <span className={`rounded-full border px-2 py-px text-[10.5px] font-semibold ${kind.className}`}>{kind.label}</span>
              </span>
              <span className="mt-0.5 block text-xs leading-5 text-[#64748b]">{check.detail}</span>
            </span>
          </li>
        })}
      </ul>
      {notRun.length > 0 && <p className="mt-2 rounded-lg bg-[#f8fafc] px-3 py-2 text-xs leading-5 text-[#64748b]">
        {notRun.length} kiểm tra chưa chạy vì phụ thuộc các mục trên: {notRun.map(check => checkInfo(check.id).label).join(', ')}.
      </p>}
    </div>
  )
}

/** Every check the server returned, one folded line per group with its count. */
export function CheckGroups({ checks, blockedBy }: { checks: TourStartCheck[]; blockedBy: readonly string[] }) {
  const groups = ORDER.map(group => ({ group, rows: checks.filter(check => checkInfo(check.id).group === group) })).filter(entry => entry.rows.length)
  return (
    <div className="divide-y divide-[#f1f5f9]">
      {groups.map(({ group, rows }) => {
        const counted = rows.filter(check => checkVerdict(check, blockedBy) !== 'info')
        const passed = counted.filter(check => check.passed).length
        const ok = passed === counted.length
        return (
          <details key={group} className="group" aria-label={CHECK_GROUP_LABEL[group]}>
            <summary className="flex cursor-pointer list-none items-center gap-3 rounded-lg px-1 py-2.5 hover:bg-[#f8fafc] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] [&::-webkit-details-marker]:hidden">
              <VerdictIcon verdict={ok ? 'passed' : 'failed'} />
              <span className="flex-1 text-[13px] font-semibold text-[#0f172a]">{CHECK_GROUP_LABEL[group]}</span>
              <span className={`text-xs font-semibold tabular-nums ${ok ? 'text-[#15803d]' : 'text-[#64748b]'}`}>{counted.length ? `${passed}/${counted.length} đạt` : 'Thông tin'}</span>
              <ChevronDown size={15} aria-hidden="true" className="text-[#94a3b8] transition-transform duration-150 group-open:rotate-180 motion-reduce:transition-none" />
            </summary>
            <ul className="mb-2 ml-8 space-y-2">
              {rows.map(check => {
                const verdict = checkVerdict(check, blockedBy)
                return <li key={check.id} className="flex items-start gap-2.5" data-verdict={verdict}>
                  <VerdictIcon verdict={verdict} />
                  <span className="min-w-0">
                    <span className="block text-[12.5px] font-medium text-[#0f172a]">{checkInfo(check.id).label}<span className="sr-only">: {VERDICT[verdict].label}</span></span>
                    <span className="block text-xs leading-5 text-[#64748b]">{check.detail}</span>
                  </span>
                </li>
              })}
            </ul>
          </details>
        )
      })}
    </div>
  )
}
