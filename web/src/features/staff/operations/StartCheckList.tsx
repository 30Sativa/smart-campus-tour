import { ArrowRight, Check, ChevronDown, Info, Minus, ShieldAlert, X } from 'lucide-react'
import type { TourStartCheck } from '../../administration/tours/types'
import {
  CHECK_FIX, CHECK_GROUP_LABEL, CHECK_SOURCE_LABEL, blockerOwner, checkCountText, checkCounts, checkDetail, checkInfo, checkVerdict,
  groupVerdict, opensAtText, type BlockerOwner, type CheckGroup, type CheckVerdict,
} from './operation-labels'

const ORDER: CheckGroup[] = ['tour', 'robot', 'telemetry', 'system', 'onsite', 'other']

const VERDICT: Record<CheckVerdict, { label: string; icon: typeof Check; className: string }> = {
  passed: { label: 'Đạt', icon: Check, className: 'bg-[#ecfdf3] text-[#15803d]' },
  failed: { label: 'Chưa đạt', icon: X, className: 'bg-[#fef2f2] text-[#dc2626]' },
  notRun: { label: 'Chưa kiểm tra', icon: Minus, className: 'bg-[#f1f5f9] text-[#64748b]' },
  info: { label: 'Thông tin', icon: Info, className: 'bg-[#eff6ff] text-[#2563eb]' },
}

function VerdictIcon({ verdict }: { verdict: CheckVerdict }) {
  const { label, icon: Icon, className } = VERDICT[verdict]
  return <span className={`grid size-5 shrink-0 place-items-center rounded-full ${className}`} title={label}><Icon size={12} strokeWidth={3} aria-hidden="true" /></span>
}

/**
 * Only the root causes, sorted by who can clear them: the Tour side (people,
 * on this system), the robot side (what the robot reports or what is recorded
 * about it) and the system gates nobody here can open. Each row carries where
 * the server read it, the server's own detail and, when there is one, what to
 * do. Checks the server skipped because of them are folded into one line, so
 * a single stale telemetry report does not read as five problems.
 */
export function BlockerList({ checks, blockedBy, opensAt, now }: { checks: TourStartCheck[]; blockedBy: readonly string[]; opensAt?: string; now?: number }) {
  const failed = checks.filter(check => checkVerdict(check, blockedBy) === 'failed')
  const notRun = checks.filter(check => checkVerdict(check, blockedBy) === 'notRun')
  if (!failed.length) return notRun.length
    ? <p className="text-[13px] font-semibold text-[#7d5310]">Còn {notRun.length} mục máy chủ chưa kiểm tra. Chờ máy chủ cập nhật.</p>
    : <p className="text-[13px] font-semibold text-[#15803d]">Mọi điều kiện từ máy chủ đều đạt.</p>
  const of = (owner: BlockerOwner) => failed.filter(check => blockerOwner(check.id) === owner)
  const system = of('system')
  const fixFor = (id: string) => id === 'withinStartWindow' ? windowFix(opensAt, now) : CHECK_FIX[id]
  return (
    <div className="space-y-4">
      {OWNERS.map(({ owner, title, note }) => {
        const rows = of(owner)
        if (!rows.length) return null
        return <div key={owner}>
          <h3 className="text-[13px] font-semibold text-[#0f172a]">{title}</h3>
          <p className="mb-1.5 text-xs leading-5 text-muted">{note}</p>
          <ul className="divide-y divide-[#f1f5f9]" aria-label={title}>
            {rows.map(check => {
              const fix = fixFor(check.id)
              return <li key={check.id} className="flex items-start gap-3 py-2.5" data-verdict="failed">
                <VerdictIcon verdict="failed" />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-[13px] font-semibold text-[#0f172a]">{checkInfo(check.id).label}</span>
                    <SourceChip source={check.source} />
                  </span>
                  <span className="mt-0.5 block text-xs leading-5 text-muted">{checkDetail(check, blockedBy, now)}</span>
                  {fix && <span className="mt-0.5 flex gap-1 text-xs leading-5 font-medium text-[#1d4ed8]"><ArrowRight size={13} className="mt-[3px] shrink-0" aria-hidden="true" />{fix}</span>}
                </span>
              </li>
            })}
          </ul>
        </div>
      })}
      {notRun.length > 0 && <p className="rounded-lg bg-[#f8fafc] px-3 py-2 text-xs leading-5 text-muted">
        {notRun.length} kiểm tra chưa chạy vì phụ thuộc các mục trên: {notRun.map(check => checkInfo(check.id).label).join(', ')}.
      </p>}
      {system.length > 0 && <div className="rounded-xl border border-[#f1dcb0] bg-[#fffaf0] px-3.5 py-3">
        <p className="flex gap-2 text-xs leading-5 font-semibold text-[#7d5310]"><ShieldAlert size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
          Hệ thống chưa cho phép robot di chuyển theo Tour. Đây không phải lỗi thao tác của bạn: báo Kỹ thuật kiểm tra.</p>
        <ul className="mt-1.5 ml-6 space-y-1" aria-label="Giới hạn hệ thống">
          {system.map(check => <li key={check.id} className="text-xs leading-5 text-[#7d5310]" data-verdict="failed">
            <span className="font-semibold">{checkInfo(check.id).label}</span>: {checkDetail(check, blockedBy, now)}
          </li>)}
        </ul>
      </div>}
    </div>
  )
}

const OWNERS: Array<{ owner: Exclude<BlockerOwner, 'system'>; title: string; note: string }> = [
  { owner: 'tour', title: 'Tour và người vận hành', note: 'Người vận hành hoặc Staff xử lý.' },
  { owner: 'robot', title: 'Robot', note: 'Mục tự chuyển sang đạt khi robot báo đúng.' },
]

function SourceChip({ source }: { source: string }) {
  const label = CHECK_SOURCE_LABEL[source]
  if (!label) return null
  return <span className="rounded-full border border-[#e2e8f0] bg-[#f8fafc] px-2 py-px text-[10.5px] font-semibold text-[#475569]">{label}</span>
}

/** The window opens at the scheduled start: before it say when, after it how to move it. Without a start time (a refusal on the live console) there is nothing to add. */
function windowFix(opensAt: string | undefined, now: number | undefined): string | undefined {
  if (!opensAt || now === undefined) return undefined
  if (new Date(opensAt).getTime() <= now) return 'Đã quá giờ bắt đầu: mở lại Tour để dời lịch.'
  return `Mở lúc ${opensAtText(opensAt, now)}. Không cần làm gì, mục này tự đạt khi tới giờ.`
}

/** Every check the server returned, one folded line per group with its count. */
export function CheckGroups({ checks, blockedBy, now }: { checks: TourStartCheck[]; blockedBy: readonly string[]; now?: number }) {
  const groups = ORDER.map(group => ({ group, rows: checks.filter(check => checkInfo(check.id).group === group) })).filter(entry => entry.rows.length)
  return (
    <div className="divide-y divide-[#f1f5f9]">
      {groups.map(({ group, rows }) => {
        const counts = checkCounts(rows, blockedBy)
        const verdict = groupVerdict(counts)
        const ok = verdict === 'passed' || verdict === 'info'
        return (
          <details key={group} className="group" aria-label={CHECK_GROUP_LABEL[group]}>
            <summary className="flex cursor-pointer list-none items-center gap-3 rounded-lg px-1 py-2.5 hover:bg-[#f8fafc] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] [&::-webkit-details-marker]:hidden">
              <VerdictIcon verdict={verdict} />
              <span className="flex-1 text-[13px] font-semibold text-[#0f172a]">{CHECK_GROUP_LABEL[group]}</span>
              <span className={`text-right text-xs font-semibold tabular-nums ${ok ? 'text-[#15803d]' : 'text-muted'}`}>{checkCountText(counts)}</span>
              <ChevronDown size={15} aria-hidden="true" className="text-[#94a3b8] transition-transform duration-150 group-open:rotate-180 motion-reduce:transition-none" />
            </summary>
            <ul className="mb-2 ml-8 space-y-2">
              {rows.map(check => {
                const verdict = checkVerdict(check, blockedBy)
                return <li key={check.id} className="flex items-start gap-2.5" data-verdict={verdict}>
                  <VerdictIcon verdict={verdict} />
                  <span className="min-w-0">
                    <span className="block text-[12.5px] font-medium text-[#0f172a]">{checkInfo(check.id).label}<span className="sr-only">: {VERDICT[verdict].label}</span></span>
                    <span className="block text-xs leading-5 text-muted">{checkDetail(check, blockedBy, now)}</span>
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
