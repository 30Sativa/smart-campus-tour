import { useState } from 'react'
import { PageHeader, PanelHead, LoadingPanel, panelClass } from '../../components/ui/ConsolePrimitives'
import { buttonClass, rowClass, tdClass, thClass } from '../../components/ui/ui-classes'
import { ConfirmationDialog } from '../../components/ui/ConfirmationDialog'
import { useConfirmRoute, useRevokeConfirmation, useRouteConfirmations } from '../../features/technical/technical-hooks'
import { TechnicalPage, ToneBadge } from '../../features/technical/TechnicalUi'
import { CONFIRMATION_STATE, errorText, stamp } from '../../features/technical/technical-format'
import type { RouteVersionConfirmation } from '../../features/technical/types'

type Pending = { kind: 'confirm' | 'revoke'; item: RouteVersionConfirmation } | null

/**
 * Version-bound technical confirmation (SRS v1.9 §3.2.b, demo acceptance 6).
 * A confirmation covers exactly one map–POI–route version. A new
 * movement-affecting version starts unconfirmed and cannot be scheduled until
 * reconfirmed; older confirmed versions stay usable as tested.
 */
export default function TechnicalConfirmationsPage() {
  const list = useRouteConfirmations()
  const confirm = useConfirmRoute()
  const revoke = useRevokeConfirmation()
  const [pending, setPending] = useState<Pending>(null)
  const busy = confirm.isPending || revoke.isPending
  const error = confirm.error ?? revoke.error
  const close = () => { setPending(null); confirm.reset(); revoke.reset() }
  const label = (item: RouteVersionConfirmation) => `${item.routeName} v${item.routeVersion}`

  return (
    <TechnicalPage>
      <PageHeader eyebrow="Kỹ thuật" title="Xác nhận kỹ thuật" description="Chỉ nhân viên kỹ thuật được xác nhận, sau khi đi kiểm tra từng POI và chạy thử toàn tuyến cùng người vận hành. Staff chỉ xếp lịch được tuyến đã xác nhận." />
      <section className={panelClass} aria-label="Version tuyến">
        <PanelHead title="Version tuyến" description="Sửa chỉ thuyết minh không làm mất xác nhận. Version mới ảnh hưởng di chuyển phải xác nhận lại." />
        {list.isPending ? <LoadingPanel /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead><tr className="border-b border-[#f1f5f9]"><th className={thClass}>Tuyến</th><th className={thClass}>Version map</th><th className={thClass}>POI</th><th className={thClass}>Trạng thái</th><th className={thClass}>Xác nhận</th><th className={thClass}><span className="sr-only">Thao tác</span></th></tr></thead>
              <tbody className="divide-y divide-[#f1f5f9]">
                {list.data?.map((item) => {
                  const state = CONFIRMATION_STATE[item.state]
                  return (
                    <tr key={item.id} className={rowClass}>
                      <td className={tdClass}><span className="font-semibold text-[#0f172a]">{item.routeName}</span> <span className="text-[#64748b]">v{item.routeVersion}</span></td>
                      <td className={`${tdClass} font-mono text-[#64748b]`}>{item.mapKey}</td>
                      <td className={`${tdClass} tabular-nums`}>{item.poiCount}</td>
                      <td className={tdClass}><ToneBadge tone={state.tone}>{state.label}</ToneBadge>{item.stateNote && <p className="mt-1 text-xs text-[#64748b]">{item.stateNote}</p>}</td>
                      <td className={`${tdClass} text-xs text-[#64748b]`}>{item.confirmedAt ? <>{stamp(item.confirmedAt)} · {item.confirmedBy}</> : '-'}</td>
                      <td className={`${tdClass} whitespace-nowrap text-right`}>
                        {item.state === 'CONFIRMED'
                          ? <button type="button" className={buttonClass('ghost', 'sm')} onClick={() => setPending({ kind: 'revoke', item })}>Thu hồi</button>
                          : <button type="button" className={buttonClass('primary', 'sm')} onClick={() => setPending({ kind: 'confirm', item })}>Xác nhận</button>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <ConfirmationDialog
        open={pending?.kind === 'confirm'}
        title={pending ? `Xác nhận ${label(pending.item)}?` : ''}
        description={<>Xác nhận chỉ áp dụng cho đúng version tuyến này trên map <strong>{pending?.item.mapKey}</strong>. <strong>Chỉ xác nhận khi đã đi kiểm tra từng POI và chạy thử toàn tuyến cùng người vận hành.</strong></>}
        confirmLabel="Xác nhận"
        requireReason
        reasonLabel="Đã kiểm tra gì"
        busy={busy}
        error={error ? errorText(error) : null}
        onCancel={close}
        onConfirm={(note) => pending && confirm.mutate({ id: pending.item.id, note }, { onSuccess: close })}
      />
      <ConfirmationDialog
        open={pending?.kind === 'revoke'}
        tone="danger"
        title={pending ? `Thu hồi xác nhận ${label(pending.item)}?` : ''}
        description="Tuyến này sẽ không xếp lịch được cho tới khi xác nhận lại. Thao tác được ghi vào audit."
        confirmLabel="Thu hồi"
        requireReason
        busy={busy}
        error={error ? errorText(error) : null}
        onCancel={close}
        onConfirm={(reason) => pending && revoke.mutate({ id: pending.item.id, reason }, { onSuccess: close })}
      />
    </TechnicalPage>
  )
}
