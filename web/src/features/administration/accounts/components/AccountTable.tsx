import { formatStamp } from '../../admin-format'
import { AdminStatusBadge } from '../../AdminUi'
import { buttonClass, rowClass, tdClass, thClass } from '../../../../components/ui/ui-classes'
import { TableFrame } from '../../AdminUi'
import type { AccountListItem, AccountSort, AccountSortField } from '../types'

export type AccountLifecycleAction = 'deactivate' | 'reactivate'

type AccountTableProps = {
  accounts: AccountListItem[]
  sort: AccountSort | ''
  onSort: (field: AccountSortField) => void
  onLifecycleAction: (account: AccountListItem, action: AccountLifecycleAction) => void
  onEdit: (account: AccountListItem) => void
}

const SORT_COLUMNS: Array<{ field: AccountSortField; label: string }> = [
  { field: 'username', label: 'Tên đăng nhập' },
  { field: 'fullName', label: 'Họ tên' },
  { field: 'role', label: 'Vai trò' },
  { field: 'isActive', label: 'Trạng thái' },
  { field: 'createdAt', label: 'Ngày tạo' },
  { field: 'updatedAt', label: 'Cập nhật' },
]

function sortDirection(sort: AccountSort | '', field: AccountSortField): 'ascending' | 'descending' | 'none' {
  if (sort === field) return 'ascending'
  if (sort === `-${field}`) return 'descending'
  return 'none'
}

function SortHeading({ field, label, sort, onSort }: {
  field: AccountSortField
  label: string
  sort: AccountSort | ''
  onSort: (field: AccountSortField) => void
}) {
  const direction = sortDirection(sort, field)
  return (
    <th scope="col" aria-sort={direction} className={thClass}>
      <button type="button" aria-label={`Sắp xếp theo ${label}`} onClick={() => onSort(field)} className="inline-flex items-center gap-1.5 rounded-md text-left hover:text-[#0f172a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb]">
        {label}<span className="text-[#94a3b8]" aria-hidden="true">{direction === 'ascending' ? '↑' : direction === 'descending' ? '↓' : '↕'}</span>
      </button>
    </th>
  )
}

function RoleValue({ role }: { role: AccountListItem['role'] }) {
  return role === null ? <AdminStatusBadge status="invalid-role" /> : <span className="inline-flex rounded-full border border-[#cfe1fb] bg-[#eef5ff] px-2 py-px text-[11px] font-bold whitespace-nowrap text-[#2f62b8]">{role === 'TechnicalStaff' ? 'Technical Staff' : role}</span>
}

function AccountAction({ account, onAction, onEdit }: { account: AccountListItem; onAction: AccountTableProps['onLifecycleAction']; onEdit: AccountTableProps['onEdit'] }) {
  if (account.role === 'Admin') return <span className="text-xs text-[#94a3b8]">cấu hình riêng</span>
  if (account.role === null) return <span className="text-xs text-[#94a3b8]">-</span>
  const action: AccountLifecycleAction = account.isActive ? 'deactivate' : 'reactivate'
  return (
    <span className="inline-flex items-center justify-center gap-1.5">
      <button type="button" onClick={() => onEdit(account)} className={buttonClass('secondary', 'sm')} aria-label={`Sửa họ tên ${account.username}`}>
        Sửa họ tên
      </button>
      <button
        type="button"
        onClick={() => onAction(account, action)}
        className={buttonClass(account.isActive ? 'danger' : 'secondary', 'sm')}
        aria-label={`${account.isActive ? 'Vô hiệu hóa' : 'Kích hoạt lại'} ${account.username}`}
      >
        {account.isActive ? 'Vô hiệu hóa' : 'Kích hoạt lại'}
      </button>
    </span>
  )
}

export function AccountTable({ accounts, sort, onSort, onLifecycleAction, onEdit }: AccountTableProps) {
  return (
    <>
      <TableFrame label="Danh sách tài khoản" wide>
        <thead className="border-b border-[#e2e8f0] bg-[#f8fafc]">
          <tr>
            {SORT_COLUMNS.map((column) => <SortHeading key={column.field} {...column} sort={sort} onSort={onSort} />)}
            <th scope="col" className={`${thClass} text-center`}>Thao tác</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#eef1f4]">
          {accounts.map((account) => (
            <tr key={account.id} data-account-id={account.id} className={rowClass}>
              <td className={`${tdClass} font-semibold text-[#1e293b]`}>{account.username}</td>
              <td className={`${tdClass} text-[#334155]`}>{account.fullName}</td>
              <td className={tdClass}><RoleValue role={account.role} /></td>
              <td className={tdClass}><AdminStatusBadge status={account.isActive ? 'account-active' : 'account-inactive'} /></td>
              <td className={`${tdClass} whitespace-nowrap text-xs text-[#64748b]`}>{formatStamp(account.createdAt)}</td>
              <td className={`${tdClass} whitespace-nowrap text-xs text-[#64748b]`}>{formatStamp(account.updatedAt)}</td>
              <td className={`${tdClass} text-center`}><AccountAction account={account} onAction={onLifecycleAction} onEdit={onEdit} /></td>
            </tr>
          ))}
        </tbody>
      </TableFrame>

      <ul className="divide-y divide-[#f1f5f9] md:hidden" aria-label="Danh sách tài khoản">
        {accounts.map((account) => (
          <li key={account.id} data-account-id={account.id} className="space-y-2.5 px-3.5 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-semibold text-[#1e293b]">{account.fullName}</p>
                <p className="truncate text-xs text-[#64748b]">{account.username}</p>
              </div>
              <AdminStatusBadge status={account.isActive ? 'account-active' : 'account-inactive'} />
            </div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
              <div><dt className="text-xs text-[#64748b]">Vai trò</dt><dd className="mt-1"><RoleValue role={account.role} /></dd></div>
              <div><dt className="text-xs text-[#64748b]">Tạo</dt><dd className="mt-1 text-xs text-[#475569]">{formatStamp(account.createdAt)}</dd></div>
              <div><dt className="text-xs text-[#64748b]">Cập nhật</dt><dd className="mt-1 text-xs text-[#475569]">{formatStamp(account.updatedAt)}</dd></div>
            </dl>
            {account.role !== 'Admin' && account.role !== null && <AccountAction account={account} onAction={onLifecycleAction} onEdit={onEdit} />}
          </li>
        ))}
      </ul>
    </>
  )
}
