import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Toaster } from '../../../components/ui/Toaster'
import { useAuthStore } from '../../../stores/auth-store'
import AdminAccountsPage from '../../../routes/admin/AdminAccountsPage'
import type { AccountListItem } from './types'

const staff: AccountListItem = {
  id: 'staff-id', username: 'staff.user', fullName: 'Staff User', role: 'Staff', isActive: true,
  createdAt: '2026-09-30T10:00:00Z', updatedAt: null, rowVersion: 'AAAAAAAAAAE=',
}
const representative: AccountListItem = {
  id: 'rep-id', username: 'rep.user', fullName: 'Representative User', role: 'Representative', isActive: false,
  createdAt: '2026-09-29T10:00:00Z', updatedAt: '2026-09-30T11:00:00Z', rowVersion: 'AAAAAAAAAAI=',
}
const admin: AccountListItem = {
  ...staff, id: 'admin-id', username: 'admin.user', fullName: 'Admin User', role: 'Admin',
}
const invalidRole: AccountListItem = {
  ...staff, id: 'invalid-id', username: 'legacy.user', fullName: 'Legacy User', role: null,
}

function paged(data: AccountListItem[], page = 1, size = 20) {
  return {
    success: true,
    message: 'Accounts retrieved.',
    data,
    pagination: { page, pageSize: size, totalItems: 45, totalPages: 3 },
    errors: null,
  }
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

type FetchHandler = (url: URL, init?: RequestInit) => Response | Promise<Response>

function stubApi(handler: FetchHandler) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
    handler(new URL(String(input), 'http://localhost'), init))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}><MemoryRouter><AdminAccountsPage /><Toaster /></MemoryRouter></QueryClientProvider>)
}

function requestExists(fetchMock: ReturnType<typeof stubApi>, predicate: (url: URL, init?: RequestInit) => boolean) {
  return fetchMock.mock.calls.some(([input, init]) => predicate(new URL(String(input), 'http://localhost'), init))
}

describe('Admin Account Management', () => {
  beforeEach(() => {
    useAuthStore.setState({
      accessToken: 'test-access-token',
      isAuthenticated: true,
      isAuthReady: true,
      user: { userId: 'admin-id', username: 'admin', role: 'Admin' },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    useAuthStore.getState().logout()
  })

  it('loads the API list, searches remotely, sorts remotely, and pages with size', async () => {
    const fetchMock = stubApi((url) => jsonResponse(paged([staff], Number(url.searchParams.get('page') ?? 1), Number(url.searchParams.get('size') ?? 20))))
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Tài khoản' })).toBeInTheDocument()
    expect((await screen.findAllByText('staff.user')).length).toBeGreaterThan(0)
    expect(screen.getAllByText('Nhân viên vận hành').length).toBeGreaterThan(0)
    expect(screen.queryByText('Staff', { selector: 'span' })).toBeNull()
    expect(requestExists(fetchMock, (url) => url.pathname === '/api/admin/accounts' && url.searchParams.get('page') === '1' && url.searchParams.get('size') === '20')).toBe(true)

    fireEvent.change(screen.getByRole('searchbox', { name: 'Tìm tài khoản' }), { target: { value: 'Nguyen' } })
    await waitFor(() => expect(requestExists(fetchMock, (url) => url.searchParams.get('search') === 'Nguyen')).toBe(true))
    await screen.findAllByText('staff.user')

    fireEvent.click(screen.getByRole('button', { name: 'Sắp xếp theo Tên đăng nhập' }))
    await waitFor(() => expect(requestExists(fetchMock, (url) => url.searchParams.get('sort') === 'username')).toBe(true))
    await screen.findAllByText('staff.user')
    fireEvent.click(screen.getByRole('button', { name: 'Sắp xếp theo Tên đăng nhập' }))
    await waitFor(() => expect(requestExists(fetchMock, (url) => url.searchParams.get('sort') === '-username')).toBe(true))
    await screen.findAllByText('staff.user')

    fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }))
    await waitFor(() => expect(requestExists(fetchMock, (url) => url.searchParams.get('page') === '2' && url.searchParams.get('size') === '20')).toBe(true))
    for (const [input] of fetchMock.mock.calls) {
      const url = new URL(String(input), 'http://localhost')
      if (url.pathname === '/api/admin/accounts') expect(url.searchParams.has('pageSize')).toBe(false)
    }
  })

  it.each(['Staff', 'TechnicalStaff', 'Representative'] as const)('creates a %s account and invalidates the list', async (role) => {
    let listCalls = 0
    let createdPayload: unknown
    const fetchMock = stubApi((url, init) => {
      if (url.pathname === '/api/admin/accounts' && init?.method === 'POST') {
        createdPayload = JSON.parse(String(init.body)) as unknown
        return jsonResponse({ success: true, message: 'Account created.', data: { ...staff, role }, errors: null })
      }
      listCalls += 1
      return jsonResponse(paged([]))
    })
    renderPage()

    fireEvent.click(screen.getAllByRole('button', { name: 'Tạo tài khoản' })[0])
    const dialog = await screen.findByRole('dialog', { name: 'Tạo tài khoản' })
    fireEvent.change(within(dialog).getByLabelText('Tên đăng nhập'), { target: { value: 'new.staff' } })
    fireEvent.change(within(dialog).getByLabelText('Họ tên'), { target: { value: 'New Staff' } })
    fireEvent.change(within(dialog).getByLabelText('Vai trò'), { target: { value: role } })
    expect(within(dialog).getAllByRole('option').map((option) => option.textContent)).toEqual(['Chọn vai trò', 'Nhân viên vận hành', 'Nhân viên kỹ thuật', 'Đại diện trường'])
    fireEvent.change(within(dialog).getByLabelText('Mật khẩu ban đầu'), { target: { value: 'one-time-secret' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Tạo tài khoản' }))

    await waitFor(() => expect(fetchMock.mock.calls.some(([input, init]) => String(input).includes('/api/admin/accounts') && init?.method === 'POST')).toBe(true))
    expect(createdPayload).toEqual({ username: 'new.staff', fullName: 'New Staff', role, initialPassword: 'one-time-secret' })
    expect(await screen.findByRole('status')).toHaveTextContent('Đã tạo tài khoản')
    expect(screen.queryByLabelText('Mật khẩu ban đầu')).toBeNull()
    await waitFor(() => expect(listCalls).toBeGreaterThan(1))
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(true)
  })

  it.each([' new.staff', 'new.staff ', 'new staff', 'new\tstaff', 'new\u00a0staff', 'new\u0085staff'])('blocks account creation for a username containing whitespace', async (username) => {
    const fetchMock = stubApi(() => jsonResponse(paged([])))
    renderPage()
    fireEvent.click(screen.getAllByRole('button', { name: 'Tạo tài khoản' })[0])
    const dialog = await screen.findByRole('dialog', { name: 'Tạo tài khoản' })
    fireEvent.change(within(dialog).getByLabelText('Tên đăng nhập'), { target: { value: username } })
    fireEvent.change(within(dialog).getByLabelText('Họ tên'), { target: { value: 'New Staff' } })
    fireEvent.change(within(dialog).getByLabelText('Vai trò'), { target: { value: 'Staff' } })
    fireEvent.change(within(dialog).getByLabelText('Mật khẩu ban đầu'), { target: { value: ' password ' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Tạo tài khoản' }))

    expect(await within(dialog).findByText('Tên đăng nhập không được chứa khoảng trắng.')).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Tên đăng nhập')).toHaveAttribute('aria-invalid', 'true')
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false)
  })

  it('shows duplicate and validation errors from the API without exposing raw bodies', async () => {
    let postNumber = 0
    stubApi((url, init) => {
      if (url.pathname === '/api/admin/accounts' && init?.method === 'POST') {
        postNumber += 1
        if (postNumber === 1) return jsonResponse({ success: false, message: 'An account with this username already exists.', data: null, errors: null }, 409)
        return jsonResponse({ success: false, message: 'One or more validation errors occurred.', data: null, errors: { Username: ['Username must be at most 100 characters.'] } }, 400)
      }
      return jsonResponse(paged([]))
    })
    renderPage()

    fireEvent.click(screen.getAllByRole('button', { name: 'Tạo tài khoản' })[0])
    let dialog = await screen.findByRole('dialog', { name: 'Tạo tài khoản' })
    fireEvent.change(within(dialog).getByLabelText('Tên đăng nhập'), { target: { value: 'duplicate' } })
    fireEvent.change(within(dialog).getByLabelText('Họ tên'), { target: { value: 'Duplicate User' } })
    fireEvent.change(within(dialog).getByLabelText('Vai trò'), { target: { value: 'Representative' } })
    fireEvent.change(within(dialog).getByLabelText('Mật khẩu ban đầu'), { target: { value: 'temporary-password' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Tạo tài khoản' }))
    expect(await within(dialog).findByText('An account with this username already exists.')).toBeInTheDocument()

    fireEvent.change(within(dialog).getByLabelText('Tên đăng nhập'), { target: { value: 'x'.repeat(101) } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Tạo tài khoản' }))
    dialog = await screen.findByRole('dialog', { name: 'Tạo tài khoản' })
    expect(await within(dialog).findByText('Username must be at most 100 characters.')).toBeInTheDocument()
    expect(screen.queryByText(/System\.InvalidOperationException|stack trace/i)).toBeNull()
  })

  it('edits only the full name, showing username and role as locked', async () => {
    let updatedPayload: unknown
    const fetchMock = stubApi((url, init) => {
      if (url.pathname === '/api/admin/accounts/staff-id' && init?.method === 'PUT') {
        updatedPayload = JSON.parse(String(init.body)) as unknown
        return jsonResponse({ success: true, message: 'Account updated.', data: { ...staff, fullName: 'Renamed Staff' }, errors: null })
      }
      return jsonResponse(paged([staff]))
    })
    renderPage()

    fireEvent.click((await screen.findAllByRole('button', { name: 'Sửa tài khoản staff.user' }))[0])
    const dialog = await screen.findByRole('dialog', { name: 'Sửa tài khoản' })
    expect(within(dialog).getByText('staff.user')).toBeInTheDocument()
    expect(within(dialog).getAllByText('(không thể sửa)')).toHaveLength(2)
    expect(within(dialog).queryByRole('textbox', { name: /Tên đăng nhập/ })).toBeNull()
    expect(within(dialog).queryByRole('combobox')).toBeNull()
    expect(within(dialog).getByText(/Vô hiệu hóa tài khoản này rồi tạo tài khoản mới/)).toBeInTheDocument()

    fireEvent.change(within(dialog).getByLabelText('Họ tên'), { target: { value: '  Renamed Staff  ' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Lưu' }))

    await waitFor(() => expect(requestExists(fetchMock, (url, init) => url.pathname === '/api/admin/accounts/staff-id' && init?.method === 'PUT')).toBe(true))
    expect(updatedPayload).toEqual({ fullName: 'Renamed Staff' })
    expect(await screen.findByRole('status')).toHaveTextContent('Đã cập nhật tài khoản staff.user')
  })

  it('confirms managed-account lifecycle actions and keeps Admin/invalid-role rows read-only', async () => {
    const fetchMock = stubApi((_url, init) => {
      if (init?.method === 'POST') return jsonResponse({ success: true, message: 'Updated.', data: null, errors: null })
      return jsonResponse(paged([admin, staff, representative, invalidRole]))
    })
    const { container } = renderPage()
    await screen.findAllByText('staff.user')
    expect(screen.getAllByText('Vai trò không hợp lệ').length).toBeGreaterThan(0)

    for (const id of ['admin-id', 'invalid-id']) {
      const accountElements = container.querySelectorAll(`[data-account-id="${id}"]`)
      expect(accountElements.length).toBeGreaterThan(0)
      for (const element of accountElements) expect(within(element as HTMLElement).queryByRole('button')).toBeNull()
    }

    fireEvent.click(screen.getAllByRole('button', { name: 'Vô hiệu hóa staff.user' })[0])
    let dialog = await screen.findByRole('dialog', { name: 'Vô hiệu hóa tài khoản?' })
    expect(within(dialog).getByText(/không xóa tài khoản/)).toBeInTheDocument()
    expect(within(dialog).getByText(/còn hiệu lực đến khi hết hạn/)).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Vô hiệu hóa tài khoản' }))
    await waitFor(() => expect(requestExists(fetchMock, (url, init) => url.pathname === '/api/admin/accounts/staff-id/deactivate' && init?.method === 'POST')).toBe(true))

    const reactivateButtons = await screen.findAllByRole('button', { name: 'Kích hoạt lại rep.user' })
    fireEvent.click(reactivateButtons[0])
    dialog = await screen.findByRole('dialog', { name: 'Kích hoạt lại tài khoản?' })
    expect(within(dialog).getByText(/phiên cũ không được khôi phục/)).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Kích hoạt lại' }))
    await waitFor(() => expect(requestExists(fetchMock, (url, init) => url.pathname === '/api/admin/accounts/rep-id/reactivate' && init?.method === 'POST')).toBe(true))
  })

  it('resets a password from the edit dialog, sends the row version and shows the password once with copy', async () => {
    let resetPayload: unknown
    const writeText = vi.fn(async () => undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    const fetchMock = stubApi((url, init) => {
      if (url.pathname === '/api/admin/accounts/staff-id/reset-password' && init?.method === 'POST') {
        resetPayload = JSON.parse(String(init.body)) as unknown
        return jsonResponse({ success: true, message: 'Account password reset.', data: null, errors: null })
      }
      return jsonResponse(paged([staff]))
    })
    renderPage()

    fireEvent.click((await screen.findAllByRole('button', { name: 'Sửa tài khoản staff.user' }))[0])
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Sửa tài khoản' })).getByRole('button', { name: 'Đặt lại mật khẩu' }))
    const confirm = await screen.findByRole('dialog', { name: 'Đặt lại mật khẩu?' })
    const field = within(confirm).getByLabelText<HTMLInputElement>('Mật khẩu mới')
    expect(field.value).toMatch(/^[A-HJ-NP-Za-km-z2-9]{16}$/)
    fireEvent.click(within(confirm).getByRole('button', { name: 'Tạo mật khẩu khác' }))
    expect(field.value).toHaveLength(16)
    fireEvent.change(field, { target: { value: 'chosen-by-admin-42' } })
    expect(requestExists(fetchMock, (url) => url.pathname.endsWith('/reset-password'))).toBe(false)
    fireEvent.click(within(confirm).getByRole('button', { name: 'Đặt lại mật khẩu' }))

    const done = await screen.findByRole('dialog', { name: 'Đã đặt lại mật khẩu' })
    expect(resetPayload).toEqual({ newPassword: 'chosen-by-admin-42', expectedRowVersion: 'AAAAAAAAAAE=' })
    expect(within(done).getByLabelText<HTMLInputElement>('Mật khẩu mới của staff.user').value).toBe('chosen-by-admin-42')
    expect(within(done).getByText(/chỉ hiện một lần/)).toBeInTheDocument()
    fireEvent.click(within(done).getByRole('button', { name: 'Sao chép' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('chosen-by-admin-42'))
    expect(await within(done).findByRole('button', { name: 'Đã sao chép' })).toBeInTheDocument()

    fireEvent.click(within(done).getByRole('button', { name: 'Xong' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.queryByDisplayValue('chosen-by-admin-42')).toBeNull()
  })

  it('keeps reset refusals inside the dialog: weak password locally, stale version from the API', async () => {
    let resetCalls = 0
    stubApi((url, init) => {
      if (url.pathname === '/api/admin/accounts/staff-id/reset-password' && init?.method === 'POST') {
        resetCalls += 1
        return jsonResponse({ success: false, message: 'Dữ liệu đã thay đổi. Tải lại trước khi tiếp tục.', data: null, errors: { code: 'STALE_VERSION' } }, 409)
      }
      return jsonResponse(paged([staff]))
    })
    renderPage()

    fireEvent.click((await screen.findAllByRole('button', { name: 'Sửa tài khoản staff.user' }))[0])
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Sửa tài khoản' })).getByRole('button', { name: 'Đặt lại mật khẩu' }))
    const confirm = await screen.findByRole('dialog', { name: 'Đặt lại mật khẩu?' })
    const field = within(confirm).getByLabelText('Mật khẩu mới')

    fireEvent.change(field, { target: { value: 'short' } })
    fireEvent.click(within(confirm).getByRole('button', { name: 'Đặt lại mật khẩu' }))
    expect(within(confirm).getByRole('alert')).toHaveTextContent('Mật khẩu mới cần từ 12 đến 128 ký tự.')
    expect(field).toHaveAttribute('aria-invalid', 'true')
    expect(resetCalls).toBe(0)

    fireEvent.change(field, { target: { value: 'long-enough-password' } })
    fireEvent.click(within(confirm).getByRole('button', { name: 'Đặt lại mật khẩu' }))
    expect(await within(confirm).findByRole('alert')).toHaveTextContent('Tài khoản vừa được thay đổi')
    expect(resetCalls).toBe(1)
    expect(screen.queryByRole('dialog', { name: 'Đã đặt lại mật khẩu' })).toBeNull()

    fireEvent.click(within(confirm).getByRole('button', { name: 'Quay lại' }))
    expect(await screen.findByRole('dialog', { name: 'Sửa tài khoản' })).toBeInTheDocument()
  })

  it('keeps the action column fixed and the Admin note in a readable colour', async () => {
    stubApi(() => jsonResponse(paged([admin, staff])))
    const { container } = renderPage()
    await screen.findAllByText('staff.user')

    expect(screen.getByRole('columnheader', { name: 'Thao tác' }).className).toMatch(/sticky right-0/)
    const note = within(container.querySelector('tr[data-account-id="admin-id"]') as HTMLElement).getByText('cấu hình riêng')
    expect(note.className).toContain('text-slate-600')
    expect(note.className).not.toContain('#94a3b8')
    expect(screen.queryByText(/Technical Staff/)).toBeNull()
  })
})
