import { useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Lock, LockOpen } from 'lucide-react'
import { ConfirmationDialog } from '../../components/ui/ConfirmationDialog'
import { PageHeader, panelClass } from '../../components/ui/ConsolePrimitives'
import { notify } from '../../components/ui/toast-store'
import { buttonClass, tdClass, thClass } from '../../components/ui/ui-classes'
import { AdminErrorPanel, AdminPage, SkeletonRows } from '../../features/administration/AdminUi'
import { scheduleBlockError, useCreateScheduleBlock, useRemoveScheduleBlock, useScheduleBlocks } from '../../features/administration/schedule/schedule-blocks'
import { campusDay, campusTime } from '../../features/administration/tours/tour-calendar'
import type { TourShift, TourShiftBlock } from '../../features/administration/tours/types'

const addDays = (day: string, delta: number) => {
  const date = new Date(`${day}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + delta)
  return date.toISOString().slice(0, 10)
}
const mondayOf = (day: string) => addDays(day, -((new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7))
const dayLabel = (day: string) => new Intl.DateTimeFormat('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${day}T00:00:00Z`))
const span = (shift: TourShift) => `${campusTime(shift.startsAt)} - ${campusTime(shift.endsAt)}`

type Target =
  | { kind: 'close'; date: string; shift: TourShift | null }
  | { kind: 'remove'; date: string; shift: TourShift | null; block: TourShiftBlock }

const targetName = (target: Target) => `${target.shift ? `${target.shift.name} ` : 'cả ngày '}${dayLabel(target.date)}`

/**
 * Admin closes a campus day or one shift for holidays or maintenance, and reopens it (docs/lich-tour-theo-ca.md §5).
 * A shift with a Tour cannot be closed: Admin does not operate Tours, so Staff cancels the Tour first.
 */
export default function AdminSchedulePage() {
  const [monday, setMonday] = useState(() => mondayOf(campusDay(new Date())))
  const sunday = addDays(monday, 6)
  const shifts = useScheduleBlocks(monday, sunday)
  const create = useCreateScheduleBlock()
  const remove = useRemoveScheduleBlock()
  const [target, setTarget] = useState<Target | null>(null)
  // A retried identical request reuses its id, so a lost response cannot look like a refusal.
  const request = useRef<{ key: string; id: string } | null>(null)
  const requestId = (key: string) => {
    if (request.current?.key !== key) request.current = { key, id: crypto.randomUUID() }
    return request.current.id
  }
  const mutation = target?.kind === 'remove' ? remove : create
  const refusal = mutation.isError ? scheduleBlockError(mutation.error) : null
  const open = (next: Target) => { create.reset(); remove.reset(); setTarget(next) }
  const close = () => { setTarget(null); request.current = null }
  const confirm = (reason: string) => {
    if (!target) return
    const done = { onSuccess: () => { notify({ title: `${target.kind === 'close' ? 'Đã khoá' : 'Đã gỡ khoá'} ${targetName(target)}` }); close() } }
    if (target.kind === 'remove') remove.mutate({ id: target.block.id, requestId: requestId(`remove:${target.block.id}`) }, done)
    else create.mutate({ requestId: requestId(`close:${target.date}:${target.shift?.code ?? ''}:${reason.trim()}`), date: target.date, shiftCode: target.shift?.code ?? null, reason: reason.trim() }, done)
  }
  const columns = shifts.data?.days[0]?.shifts ?? []

  return <AdminPage>
    <PageHeader eyebrow="Cấu hình" title="Lịch vận hành" description="Khoá cả ngày hoặc một ca khi nghỉ lễ, bảo trì. Staff không tạo được Tour vào ca bị khoá và thấy lý do trên Lịch Tour." />
    <section className={panelClass} aria-label="Các ca trong tuần">
      <div className="flex flex-wrap items-center gap-2 border-b border-[#f1f5f9] p-3">
        <button type="button" className={`${buttonClass('secondary', 'sm')} size-9 px-0`} aria-label="Tuần trước" onClick={() => setMonday(addDays(monday, -7))}><ChevronLeft size={16} aria-hidden="true" /></button>
        <h2 className="px-1 text-[15px] font-semibold text-[#0f172a] tabular-nums">{dayLabel(monday)} đến {dayLabel(sunday)}</h2>
        <button type="button" className={`${buttonClass('secondary', 'sm')} size-9 px-0`} aria-label="Tuần sau" onClick={() => setMonday(addDays(monday, 7))}><ChevronRight size={16} aria-hidden="true" /></button>
        <button type="button" className={buttonClass('secondary', 'sm')} onClick={() => setMonday(mondayOf(campusDay(new Date())))}>Tuần này</button>
        <span className="ml-auto text-xs text-[#64748b]">Giờ Việt Nam. Danh sách ca sửa trong cấu hình máy chủ.</span>
      </div>
      {shifts.isPending ? <SkeletonRows rows={7} />
        : shifts.isError ? <AdminErrorPanel title={scheduleBlockError(shifts.error).message} onRetry={() => void shifts.refetch()} />
        : <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm" aria-label="Lịch vận hành">
          <thead><tr>
            <th className={thClass}>Ngày</th>
            {columns.map(shift => <th key={shift.code} className={thClass}>{shift.name}<span className="block font-normal text-[#64748b] tabular-nums">{span(shift)}</span></th>)}
            <th className={thClass}>Cả ngày</th>
          </tr></thead>
          <tbody>{shifts.data.days.map(day => {
            const dayBlock = day.shifts.find(shift => shift.block?.scope === 'DAY')?.block ?? null
            return <tr key={day.date} className="border-t border-[#f1f5f9] align-top">
              <td className={`${tdClass} font-medium whitespace-nowrap first-letter:uppercase`}>{dayLabel(day.date)}</td>
              {day.shifts.map(shift => <td key={shift.code} className={tdClass}>
                {dayBlock ? <span className="text-xs text-[#64748b]">Khoá theo ngày</span>
                  : shift.block ? <Closed reason={shift.block.reason} label={`Gỡ khoá ${shift.name} ${day.date}`} onRemove={() => open({ kind: 'remove', date: day.date, shift, block: shift.block! })} />
                  : <button type="button" className={buttonClass('secondary', 'sm')} aria-label={`Khoá ${shift.name} ${day.date}`} onClick={() => open({ kind: 'close', date: day.date, shift })}><Lock size={13} aria-hidden="true" />Khoá ca</button>}
              </td>)}
              <td className={tdClass}>
                {dayBlock ? <Closed reason={dayBlock.reason} label={`Gỡ khoá cả ngày ${day.date}`} onRemove={() => open({ kind: 'remove', date: day.date, shift: null, block: dayBlock })} />
                  : <button type="button" className={buttonClass('secondary', 'sm')} aria-label={`Khoá cả ngày ${day.date}`} onClick={() => open({ kind: 'close', date: day.date, shift: null })}><Lock size={13} aria-hidden="true" />Khoá ngày</button>}
              </td>
            </tr>
          })}</tbody>
        </table></div>}
    </section>

    {/* Keyed so a typed reason never carries over to another shift. */}
    {target && <ConfirmationDialog key={`${target.kind}:${target.date}:${target.shift?.code ?? 'day'}`} open
      title={target.kind === 'close' ? `Khoá ${targetName(target)}` : `Gỡ khoá ${targetName(target)}`}
      description={target.kind === 'close' ? 'Staff sẽ không tạo được Tour vào đây và thấy lý do bạn nhập.' : <>Staff lại tạo được Tour vào đây. Lý do đang khoá: {target.block.reason}</>}
      confirmLabel={target.kind === 'close' ? 'Khoá' : 'Gỡ khoá'} busyLabel="Đang lưu…" busy={mutation.isPending}
      withReason={target.kind === 'close'} requireReason reasonLabel="Lý do khoá" reasonPlaceholder="Ví dụ: Nghỉ lễ, bảo trì robot…"
      error={refusal?.message} onConfirm={confirm} onCancel={close}>
      {refusal && refusal.tours.length > 0 && <div role="status" className="rounded-xl border border-[#f5c8c2] bg-[#fff1ef] px-3 py-2 text-sm text-[#7f2f25]">
        <p className="font-semibold">Tour đang chiếm chỗ:</p>
        <ul aria-label="Tour đang chiếm chỗ" className="mt-1 list-inside list-disc">{refusal.tours.map(tour => <li key={tour}>{tour}</li>)}</ul>
      </div>}
    </ConfirmationDialog>}
  </AdminPage>
}

function Closed({ reason, label, onRemove }: { reason: string; label: string; onRemove: () => void }) {
  return <div className="max-w-56">
    <p className="rounded-lg bg-[#f1f5f9] px-2 py-1 text-xs text-[#475569]"><span className="font-semibold">Đã khoá:</span> {reason}</p>
    <button type="button" className={`${buttonClass('ghost', 'sm')} mt-1`} aria-label={label} onClick={onRemove}><LockOpen size={13} aria-hidden="true" />Gỡ khoá</button>
  </div>
}
