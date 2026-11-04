import { useState } from 'react'
import { Lock, LockOpen, MonitorPlay, PlayCircle, X } from 'lucide-react'
import { Link } from 'react-router'
import { panelClass } from '../../../components/ui/ConsolePrimitives'
import { ConfirmationDialog } from '../../../components/ui/ConfirmationDialog'
import { notify } from '../../../components/ui/toast-store'
import { buttonClass } from '../../../components/ui/ui-classes'
import { operationRefusal } from '../../staff/operations/operation-errors'
import { useMarkTourReady, useReopenTour, useRequestId } from './hooks'
import type { TourDetails } from './types'

const refusalText = (error: unknown) => {
  const refusal = operationRefusal(error)
  return refusal.blockers.length ? `${refusal.message} ${refusal.blockers.map(blocker => blocker.message).join(' ')}` : refusal.message
}

/**
 * READY ("Chốt Tour") and Reopen for one Tour, exactly as the server permits
 * them (ADR-0042): the button follows `permissions`, and every failing READY
 * condition is listed in the server's words. READY locks registrations and
 * configuration; it does not take the robot, start the Tour or send a command.
 */
export function TourReadyPanel({ detail }: { detail: TourDetails }) {
  const { tour, permissions } = detail
  const markReady = useMarkTourReady()
  const reopen = useReopenTour()
  const [dialog, setDialog] = useState<'ready' | 'reopen' | null>(null)
  const readyRequest = useRequestId(`ready:${tour.id}:${tour.rowVersion}`)
  const reopenRequest = useRequestId(`reopen:${tour.id}:${tour.rowVersion}`)
  const blockers = permissions.readyBlockers ?? []
  const supported = permissions.canMarkReady !== undefined

  const confirmReady = async () => {
    try {
      await markReady.mutateAsync({ id: tour.id, requestId: readyRequest, rowVersion: tour.rowVersion })
      setDialog(null)
      notify({ title: `Đã chốt Tour “${tour.name}”`, detail: 'Đăng ký và cấu hình đã khóa. Người vận hành kiểm tra điều kiện rồi bắt đầu đúng giờ.' })
    } catch { /* The dialog shows the refusal. */ }
  }
  const confirmReopen = async (reason: string) => {
    try {
      await reopen.mutateAsync({ id: tour.id, requestId: reopenRequest, rowVersion: tour.rowVersion, reason: reason.trim() })
      setDialog(null)
      notify({ tone: 'info', title: `Đã mở lại Tour “${tour.name}”`, detail: 'Tour quay lại nhận đăng ký; giữ chỗ robot, đăng ký và lời mời không đổi.' })
    } catch { /* The dialog shows the refusal and keeps the reason. */ }
  }

  if (tour.state === 'RUNNING' || ((tour.state === 'COMPLETED' || tour.state === 'CANCELLED') && detail.startedAt)) {
    return <section className={`${panelClass} mb-3 flex flex-wrap items-center justify-between gap-3 p-4`} aria-label="Vận hành Tour">
      <p className="text-sm text-[#334155]">{tour.state === 'RUNNING' ? 'Tour đang chạy. Theo dõi trạng thái và lệnh robot ở màn hình điều hành.' : 'Tour đã chạy xong. Xem lại trạng thái cuối ở màn hình điều hành.'}</p>
      <Link to={`/staff/live/${tour.id}`} className={buttonClass('primary', 'sm')}><MonitorPlay size={15} aria-hidden="true" />Mở điều hành</Link>
    </section>
  }
  if (tour.state !== 'SCHEDULED' && tour.state !== 'READY') return null

  return (
    <section className={`${panelClass} mb-3 p-4`} aria-label="Chốt Tour">
      {tour.state === 'SCHEDULED' ? <>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold text-[#0f172a]">Chốt Tour (READY)</h2>
            <p className="mt-1 max-w-2xl text-[13px] leading-5 text-[#64748b]">Chốt khóa đăng ký và cấu hình để chuẩn bị bắt đầu. Chốt không nhận robot, không bắt đầu Tour và không gửi lệnh nào tới robot.</p>
          </div>
          {supported && <button type="button" className={buttonClass('primary', 'sm')} disabled={!permissions.canMarkReady} onClick={() => { markReady.reset(); setDialog('ready') }}
            aria-describedby={`ready-state-${tour.id}`}><Lock size={15} aria-hidden="true" />Chốt Tour</button>}
        </div>
        <div id={`ready-state-${tour.id}`} className="mt-3">
          {!supported ? <p className="text-[13px] text-[#7d5310]">Máy chủ đang dùng chưa hỗ trợ chốt Tour. Cập nhật máy chủ rồi tải lại trang.</p>
            : blockers.length ? <>
              <p className="text-[13px] font-semibold text-[#9d3428]">Chưa chốt được, còn {blockers.length} điều kiện chưa đạt:</p>
              <ul className="mt-2 space-y-1.5" aria-label="Điều kiện chốt chưa đạt">{blockers.map(blocker => <li key={blocker.code} className="flex items-start gap-2 text-[13px] text-[#334155]">
                <span className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full bg-[#fef2f2] text-[#dc2626]"><X size={10} strokeWidth={3} aria-hidden="true" /></span>{blocker.message}
              </li>)}</ul>
            </>
            : <p className="text-[13px] font-semibold text-[#15803d]">Tour đủ điều kiện chốt.</p>}
        </div>
      </> : <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-[#0f172a]">Tour đã chốt</h2>
          <p className="mt-1 max-w-2xl text-[13px] leading-5 text-[#64748b]">Đăng ký và cấu hình đang khóa; lời mời và truy cập của học sinh vẫn hoạt động. Người vận hành được giao kiểm tra điều kiện rồi bắt đầu Tour.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to={`/staff/tours/${tour.id}/start`} className={buttonClass('primary', 'sm')}><PlayCircle size={15} aria-hidden="true" />Kiểm tra trước khi bắt đầu</Link>
          {permissions.canReopen && <button type="button" className={buttonClass('secondary', 'sm')} onClick={() => { reopen.reset(); setDialog('reopen') }}><LockOpen size={15} aria-hidden="true" />Mở lại</button>}
        </div>
      </div>}

      <ConfirmationDialog open={dialog === 'ready'} title="Chốt Tour?" confirmLabel="Chốt Tour" withReason={false} busyLabel="Đang chốt…"
        description="Đại diện trường không còn tạo, sửa hay hủy đăng ký; Staff không duyệt dòng đăng ký và không sửa thông tin Tour. Lời mời và truy cập của học sinh vẫn hoạt động. Có thể mở lại khi Tour chưa bắt đầu."
        busy={markReady.isPending} error={markReady.isError ? refusalText(markReady.error) : null}
        onCancel={() => { if (!markReady.isPending) setDialog(null) }} onConfirm={() => void confirmReady()} />
      <ConfirmationDialog open={dialog === 'reopen'} title="Mở lại Tour?" confirmLabel="Mở lại" requireReason reasonLabel="Lý do mở lại" busyLabel="Đang mở lại…"
        description="Tour quay lại trạng thái nhận đăng ký để sửa đăng ký hoặc cấu hình. Giữ chỗ robot, đăng ký và lời mời không đổi. Lý do được ghi vào nhật ký Tour."
        busy={reopen.isPending} error={reopen.isError ? refusalText(reopen.error) : null}
        onCancel={() => { if (!reopen.isPending) setDialog(null) }} onConfirm={reason => void confirmReopen(reason)} />
    </section>
  )
}
