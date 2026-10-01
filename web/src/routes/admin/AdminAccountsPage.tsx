import { useState } from 'react'
import { Plus, RotateCcw } from 'lucide-react'
import { PageHeader, Pagination, PanelHead, SearchField, panelClass } from '../../features/staff/StaffUi'
import { buttonClass } from '../../features/staff/ui-classes'
import { AdminPage, EmptyState, Notice, SkeletonRows } from '../../features/administration/AdminUi'
import { AccountStatusAction } from '../../features/administration/accounts/components/AccountStatusAction'
import { AccountTable, type AccountLifecycleAction } from '../../features/administration/accounts/components/AccountTable'
import { CreateAccountDialog } from '../../features/administration/accounts/components/CreateAccountDialog'
import { accountRequestError } from '../../features/administration/accounts/errors'
import { useAccounts } from '../../features/administration/accounts/hooks'
import { useDebouncedValue } from '../../features/administration/accounts/use-debounced-value'
import type { AccountListItem, AccountSort, AccountSortField } from '../../features/administration/accounts/types'

const PAGE_SIZE = 20

export default function AdminAccountsPage() {
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<AccountSort | ''>('')
  const [page, setPage] = useState(1)
  const [createOpen, setCreateOpen] = useState(false)
  const [pendingAction, setPendingAction] = useState<{ account: AccountListItem; action: AccountLifecycleAction } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const debouncedSearch = useDebouncedValue(search.trim(), 300)
  const accounts = useAccounts({ search: debouncedSearch || undefined, sort: sort || undefined, page, size: PAGE_SIZE })

  const changeSort = (field: AccountSortField) => {
    setPage(1)
    setSort((current) => current === field ? `-${field}` : field)
  }

  const pageData = accounts.data
  const totalPages = Math.max(pageData?.pagination.totalPages ?? 1, 1)

  return (
    <AdminPage>
      <PageHeader
        eyebrow="Quản trị"
        title="Quản lý tài khoản"
        description="Tạo tài khoản Staff và Đại diện trường, tìm kiếm và cập nhật trạng thái truy cập. Admin được quản lý qua cấu hình ban đầu."
        action={<button type="button" onClick={() => { setNotice(null); setCreateOpen(true) }} className={buttonClass('primary')}><Plus size={17} aria-hidden="true" />Tạo tài khoản</button>}
      />

      {notice && <div className="mb-4"><Notice>{notice}</Notice></div>}

      <section className={panelClass} aria-label="Danh sách tài khoản">
        <PanelHead title="Tài khoản" description="Tìm theo tên đăng nhập hoặc họ tên. Danh sách và thứ tự do máy chủ cung cấp." />
        <div className="border-b border-[#f1f5f9] p-4">
          <SearchField
            value={search}
            onChange={(value) => { setSearch(value); setPage(1) }}
            label="Tìm tài khoản"
            placeholder="Tên đăng nhập hoặc họ tên…"
            className="w-full sm:max-w-md"
          />
        </div>

        {accounts.isPending ? (
          <SkeletonRows rows={6} label="Đang tải danh sách tài khoản" />
        ) : accounts.isError ? (
          <div className="p-4">
            <Notice tone="danger" action={<button type="button" onClick={() => void accounts.refetch()} className={buttonClass('secondary', 'sm')}><RotateCcw size={14} aria-hidden="true" />Thử lại</button>}>
              {accountRequestError(accounts.error, 'Không thể tải danh sách tài khoản. Vui lòng thử lại.')}
            </Notice>
          </div>
        ) : pageData?.data.length === 0 ? (
          <EmptyState
            title={debouncedSearch ? 'Không có tài khoản nào khớp tìm kiếm' : 'Chưa có tài khoản nào'}
            description={debouncedSearch ? 'Thử tên đăng nhập hoặc họ tên khác.' : 'Tạo tài khoản Staff hoặc Đại diện trường để bắt đầu.'}
            action={!debouncedSearch ? <button type="button" onClick={() => setCreateOpen(true)} className={buttonClass('primary', 'sm')}><Plus size={15} aria-hidden="true" />Tạo tài khoản</button> : undefined}
          />
        ) : pageData ? (
          <>
            <AccountTable
              accounts={pageData.data}
              sort={sort}
              onSort={changeSort}
              onLifecycleAction={(account, action) => { setNotice(null); setPendingAction({ account, action }) }}
            />
            <div className="px-4 py-2 text-xs text-[#64748b]" aria-live="polite">
              Trang {pageData.pagination.page} / {totalPages} · {pageData.pagination.totalItems} tài khoản
            </div>
            <Pagination
              page={pageData.pagination.page}
              pageCount={totalPages}
              total={pageData.pagination.totalItems}
              pageSize={pageData.pagination.pageSize}
              onPage={setPage}
              label="Phân trang danh sách tài khoản"
            />
          </>
        ) : null}
      </section>

      {createOpen && <CreateAccountDialog onClose={() => setCreateOpen(false)} onCreated={() => { setCreateOpen(false); setNotice('Đã tạo tài khoản.') }} />}
      {pendingAction && <AccountStatusAction
        account={pendingAction.account}
        action={pendingAction.action}
        onClose={() => setPendingAction(null)}
        onCompleted={(message) => { setPendingAction(null); setNotice(message) }}
      />}
    </AdminPage>
  )
}
