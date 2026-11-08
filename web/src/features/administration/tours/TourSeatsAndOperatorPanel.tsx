import { useState, type FormEvent } from 'react'
import { panelClass } from '../../../components/ui/ConsolePrimitives'
import { ConfirmationDialog } from '../../../components/ui/ConfirmationDialog'
import { notify } from '../../../components/ui/toast-store'
import { buttonClass, inputClass } from '../../../components/ui/ui-classes'
import { Notice } from '../AdminUi'
import { newRequestId, useChangeTourCapacity, useChangeTourOperator, useTourOperators } from './hooks'
import { seatsLabel, tourError } from './tour-messages'
import type { TourDetails } from './types'

/** Seats and Operator can change until Start, READY included (ADR-0048); each write rechecks under the server's locks. */
export function TourSeatsAndOperatorPanel({ detail }: { detail: TourDetails }) {
  const { tour, operator, permissions } = detail
  const capacity = useChangeTourCapacity()
  const change = useChangeTourOperator()
  const operators = useTourOperators()
  const [seats, setSeats] = useState(String(tour.capacity ?? ''))
  const [operatorUserId, setOperatorUserId] = useState('')
  const [confirming, setConfirming] = useState(false)
  if (!permissions.canChangeCapacity && !permissions.canChangeOperator) return null
  const minSeats = Math.max(1, tour.heldSeats ?? 1)
  const chosen = operators.data?.find(person => person.userId === operatorUserId)

  const saveSeats = (event: FormEvent) => {
    event.preventDefault()
    capacity.mutate({ id: tour.id, requestId: newRequestId(), rowVersion: tour.rowVersion, capacity: Number(seats) },
      { onSuccess: () => notify({ title: `Đã đổi sức chứa thành ${seats} chỗ` }) })
  }
  const saveOperator = () => change.mutate({ id: tour.id, requestId: newRequestId(), rowVersion: tour.rowVersion, operatorUserId }, {
    onSuccess: () => {
      setConfirming(false)
      setOperatorUserId('')
      notify({ title: `Đã giao Tour cho ${chosen?.fullName ?? 'người vận hành mới'}` })
    },
  })

  return <section className={`${panelClass} mt-3 space-y-4 p-4`} aria-label="Sức chứa và người vận hành">
    <h2 className="text-[15px] font-semibold">Sức chứa và người vận hành</h2>
    {permissions.canChangeCapacity && <form onSubmit={saveSeats} className="space-y-2">
      {capacity.isError && <Notice tone="danger">{tourError(capacity.error)}</Notice>}
      <label className="block text-sm">Sức chứa<input required type="number" min={minSeats} max={permissions.maxCapacity} step={1} className={inputClass} value={seats} onChange={event => { capacity.reset(); setSeats(event.target.value) }} />
        <span className="mt-1 block text-xs text-[#64748b]">{seatsLabel(tour)}. Không giảm được xuống dưới số chỗ đang được giữ.</span></label>
      <button type="submit" disabled={capacity.isPending || Number(seats) === tour.capacity} className={buttonClass('secondary', 'sm')}>{capacity.isPending ? 'Đang lưu…' : 'Lưu sức chứa'}</button>
    </form>}
    {permissions.canChangeOperator && <div className="space-y-2">
      <label className="block text-sm">Đổi người vận hành<select title="" aria-label="Đổi người vận hành" className={inputClass} value={operatorUserId} disabled={operators.isPending} onChange={event => { change.reset(); setOperatorUserId(event.target.value) }}>
        <option value="">Chọn Staff</option>
        {operators.data?.filter(person => person.userId !== operator?.userId).map(person => <option key={person.userId} value={person.userId}>{person.fullName} · {person.username}</option>)}
      </select>
        {operator && <span className="mt-1 block text-xs text-[#64748b]">Đang giao cho {operator.fullName}.</span>}
        {operators.isError && <span role="alert" className="mt-1 block text-xs text-[#b23e31]">Không tải được danh sách Staff.</span>}</label>
      <button type="button" disabled={!operatorUserId} className={buttonClass('secondary', 'sm')} onClick={() => { change.reset(); setConfirming(true) }}>Đổi người vận hành</button>
    </div>}
    <ConfirmationDialog open={confirming} title="Đổi người vận hành?" confirmLabel="Đổi người vận hành" busyLabel="Đang đổi…" withReason={false}
      description={`Tour sẽ giao cho ${chosen?.fullName ?? 'người được chọn'}. Chỉ người vận hành mới bắt đầu được Tour. Trạng thái của Tour giữ nguyên.`}
      busy={change.isPending} error={change.isError ? tourError(change.error) : null}
      onCancel={() => { if (!change.isPending) setConfirming(false) }} onConfirm={saveOperator} />
  </section>
}
