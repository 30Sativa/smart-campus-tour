import { ConfirmationDialog } from '../../../../components/ui/ConfirmationDialog'
import { notify } from '../../../../components/ui/toast-store'
import { useDeactivateAccount, useReactivateAccount } from '../hooks'
import { accountInUseBlockers, accountRequestError } from '../errors'
import type { AccountLifecycleAction } from './AccountTable'
import type { AccountListItem } from '../types'

export function AccountStatusAction({ account, action, onClose, onCompleted }: {
  account: AccountListItem
  action: AccountLifecycleAction
  onClose: () => void
  onCompleted: () => void
}) {
  const deactivate = useDeactivateAccount()
  const reactivate = useReactivateAccount()
  const mutation = action === 'deactivate' ? deactivate : reactivate
  const isDeactivation = action === 'deactivate'
  const blockers = accountInUseBlockers(mutation.error)

  return (
    <ConfirmationDialog
      open
      title={isDeactivation ? 'Vô hiệu hóa tài khoản?' : 'Kích hoạt lại tài khoản?'}
      description={isDeactivation
        ? 'Tài khoản sẽ không đăng nhập hoặc làm mới phiên được nữa. Thao tác này không xóa tài khoản. Access token đã cấp có thể còn hiệu lực đến khi hết hạn.'
        : 'Tài khoản có thể đăng nhập lại bằng mật khẩu hiện có. Mật khẩu không được đặt lại và phiên cũ không được khôi phục.'}
      confirmLabel={isDeactivation ? 'Vô hiệu hóa tài khoản' : 'Kích hoạt lại'}
      busyLabel={isDeactivation ? 'Đang vô hiệu hóa…' : 'Đang kích hoạt…'}
      tone={isDeactivation ? 'danger' : 'default'}
      busy={mutation.isPending}
      error={mutation.isError ? accountRequestError(mutation.error, 'Không thể cập nhật tài khoản. Vui lòng thử lại.') : null}
      withReason={false}
      onConfirm={() => mutation.mutate(account.id, {
        onSuccess: () => {
          notify(isDeactivation
            ? { title: `Đã vô hiệu hóa ${account.username}`, detail: 'Tài khoản không đăng nhập được nữa. Có thể kích hoạt lại bất cứ lúc nào.' }
            : { title: `Đã kích hoạt lại ${account.username}`, detail: 'Tài khoản đăng nhập lại được bằng mật khẩu hiện có.' })
          onCompleted()
        },
      })}
      onCancel={onClose}
    >
      <p className="rounded-xl bg-[#f8fafc] px-3 py-2 text-sm font-semibold text-[#334155]">{account.fullName} · {account.username}</p>
      {blockers.length > 0 && <div className="mt-2 text-sm text-[#334155]">
        <ul className="list-disc space-y-1 pl-5">{blockers.map(blocker => <li key={blocker}>{blocker}</li>)}</ul>
        <p className="mt-2 text-[#64748b]">Admin không tự xử lý được các mục này. Hãy báo Staff hoặc Đại diện trường xử lý xong rồi vô hiệu hóa lại.</p>
      </div>}
    </ConfirmationDialog>
  )
}
