import { ConfirmationDialog } from '../../../../components/ui/ConfirmationDialog'
import { useDeactivateAccount, useReactivateAccount } from '../hooks'
import { accountRequestError } from '../errors'
import type { AccountLifecycleAction } from './AccountTable'
import type { AccountListItem } from '../types'

export function AccountStatusAction({ account, action, onClose, onCompleted }: {
  account: AccountListItem
  action: AccountLifecycleAction
  onClose: () => void
  onCompleted: (message: string) => void
}) {
  const deactivate = useDeactivateAccount()
  const reactivate = useReactivateAccount()
  const mutation = action === 'deactivate' ? deactivate : reactivate
  const isDeactivation = action === 'deactivate'

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
        onSuccess: () => onCompleted(isDeactivation ? 'Đã vô hiệu hóa tài khoản.' : 'Đã kích hoạt lại tài khoản.'),
      })}
      onCancel={onClose}
    >
      <p className="rounded-xl bg-[#f8fafc] px-3 py-2 text-sm font-semibold text-[#334155]">{account.fullName} · {account.username}</p>
    </ConfirmationDialog>
  )
}
