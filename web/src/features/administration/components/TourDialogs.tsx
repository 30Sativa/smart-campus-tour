import type { ReactNode } from 'react'
import type { AdminTourDetail } from '../../../api/contracts/admin'
import { ConfirmationDialog } from '../../staff/components/ConfirmationDialog'
import { isStale, readAdminError } from '../admin-status'
import { useTourTransition, type TourTransition } from '../admin-hooks'

type DialogProps = { tour: AdminTourDetail; open: boolean; onClose: () => void; onReload: () => void }

/**
 * Shared plumbing for the three Admin transitions. Each sends the version
 * the Admin is looking at; if the Tour changed meanwhile the server refuses,
 * the page reloads, and the dialog says so rather than acting on old data.
 */
function useTransition(tour: AdminTourDetail, action: TourTransition, onClose: () => void, onReload: () => void) {
  const mutation = useTourTransition()
  const run = (reason?: string) =>
    mutation.mutate(
      { id: tour.id, action, version: tour.version, reason },
      {
        onSuccess: () => {
          mutation.reset()
          onClose()
        },
        onError: (error) => {
          if (isStale(error)) onReload()
        },
      },
    )
  const error = mutation.isError ? (isStale(mutation.error) ? 'Dữ liệu đã thay đổi. Vui lòng tải lại. Trang đã lấy dữ liệu mới, hãy kiểm tra rồi xác nhận lần nữa.' : readAdminError(mutation.error).message) : null
  const cancel = () => {
    mutation.reset()
    onClose()
  }
  return { run, error, busy: mutation.isPending, cancel }
}

function Effects({ items }: { items: ReactNode[] }) {
  return <ul className="list-disc space-y-1 pl-5 text-[13px] leading-5 text-[#3a3d44]">{items.map((item, i) => <li key={i}>{item}</li>)}</ul>
}

/** "Chốt buổi" (scope §5.2): Scheduled → Ready. Locks content and groups; says nothing about the robot. */
export function FinalizeTourDialog({ tour, open, onClose, onReload }: DialogProps) {
  const t = useTransition(tour, 'finalize', onClose, onReload)
  const students = tour.registrations.filter((reg) => reg.state === 'Approved').reduce((sum, reg) => sum + reg.studentCount, 0)
  return (
    <ConfirmationDialog
      open={open}
      title="Chốt Tour sang READY?"
      description={<>Tour <strong>{tour.name}</strong> sẽ chuyển sang <strong>Sẵn sàng</strong>.</>}
      confirmLabel="Xác nhận chốt"
      busyLabel="Đang chốt…"
      withReason={false}
      busy={t.busy}
      error={t.error}
      onConfirm={() => t.run()}
      onCancel={t.cancel}
    >
      <div className="space-y-3">
        <dl className="grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-[#dbe8b8] bg-[#f5f9ea] px-3 py-2"><dt className="text-[11px] font-semibold text-[#5f6b4a]">Đoàn đã duyệt</dt><dd className="text-lg font-bold text-[#1c1c1c] tabular-nums">{tour.counts.approved} <span className="text-xs font-semibold text-[#6b6e75]">· {students} học sinh</span></dd></div>
          <div className="rounded-xl border border-[#e3e3dc] bg-[#f7f7f3] px-3 py-2"><dt className="text-[11px] font-semibold text-[#6b6e75]">Đăng ký chờ duyệt</dt><dd className="text-lg font-bold text-[#1c1c1c] tabular-nums">{tour.counts.submitted}</dd></div>
        </dl>
        <Effects
          items={[
            'Khóa thông tin Tour, tuyến và danh sách các đoàn; đóng nhận đăng ký mới.',
            'Vẫn gửi / gửi lại được thông tin tham gia cho đoàn đã duyệt.',
            'Staff có thể bắt đầu Tour sau khi kiểm tra robot tại chỗ. Chốt Tour không kiểm tra hay giữ robot.',
            'Có thể Mở lại Tour trước khi Staff bắt đầu nếu cần sửa.',
          ]}
        />
      </div>
    </ConfirmationDialog>
  )
}

/** "Mở lại" (scope §5.2): Ready → Scheduled, only before Start. Approved groups stay approved. */
export function ReopenTourDialog({ tour, open, onClose, onReload }: DialogProps) {
  const t = useTransition(tour, 'reopen', onClose, onReload)
  return (
    <ConfirmationDialog
      open={open}
      title="Mở lại Tour?"
      description={<>Tour <strong>{tour.name}</strong> quay về <strong>Đang chuẩn bị</strong> để sửa thông tin hoặc duyệt lại.</>}
      confirmLabel="Mở lại Tour"
      busyLabel="Đang mở lại…"
      withReason={false}
      busy={t.busy}
      error={t.error}
      onConfirm={() => t.run()}
      onCancel={t.cancel}
    >
      <Effects
        items={[
          `${tour.counts.approved} đoàn đã duyệt vẫn giữ trạng thái Đã duyệt; học sinh vẫn ở phòng chờ.`,
          'Đại diện lại có thể sửa hoặc gửi đăng ký; đoàn nào thay danh sách sẽ về Chờ duyệt.',
          'Staff không thể bắt đầu cho đến khi Tour được chốt lại.',
        ]}
      />
    </ConfirmationDialog>
  )
}

/** Cancel before it runs (scope §3.12): Scheduled/Ready → Cancelled, with a reason. A running Tour is Staff's End Early. */
export function CancelTourDialog({ tour, open, onClose, onReload }: DialogProps) {
  const t = useTransition(tour, 'cancel', onClose, onReload)
  return (
    <ConfirmationDialog
      key={`${tour.id}-${open}`}
      open={open}
      title="Hủy Tour?"
      description={<>Tour <strong>{tour.name}</strong> sẽ chuyển sang <strong>Đã hủy</strong>. Hủy không xóa dữ liệu và không hoàn tác được.</>}
      confirmLabel="Hủy Tour"
      busyLabel="Đang hủy…"
      tone="danger"
      requireReason
      reasonLabel="Lý do hủy"
      reasonPlaceholder="Ví dụ: Trường báo trùng lịch, đổi sang buổi khác…"
      busy={t.busy}
      error={t.error}
      onConfirm={(reason) => t.run(reason)}
      onCancel={t.cancel}
    >
      <Effects
        items={[
          `Quyền vào phiên của ${tour.counts.approved} đoàn đã duyệt hết hiệu lực.`,
          'Tour vẫn được lưu trong Lịch sử Tour cùng lý do hủy.',
          'Nếu cần buổi khác, tạo Tour mới; đoàn đăng ký lại theo Tour mới.',
        ]}
      />
    </ConfirmationDialog>
  )
}
