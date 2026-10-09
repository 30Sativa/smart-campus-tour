import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Link, MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { StudentInvitationPage } from './StudentInvitationPage'
import StudentTourPage from '../../../routes/student/StudentTourPage'
import { useAuthStore } from '../../../stores/auth-store'

const tourId = '11111111-1111-1111-1111-111111111111'
const otherTour = '22222222-2222-2222-2222-222222222222'
const key = ['student-invitation', tourId]
const info = { tourId, tourName: 'Tour được mời', tourState: 'SCHEDULED', scheduledStartAt: '2026-10-20T02:00:00Z',
  invitationExpiresAt: '2026-10-21T02:00:00Z', rowType: 'INDIVIDUAL', fallbackVideoUrl: null }
let client: QueryClient
function response(data: unknown = info, status = 200) {
  return new Response(JSON.stringify({ success: status === 200, data }), { status })
}
function mount() {
  return render(<QueryClientProvider client={client}><StudentInvitationPage tourId={tourId} /></QueryClientProvider>)
}
function submitCode() {
  fireEvent.change(screen.getByLabelText('Mã truy cập'), { target: { value: 'ABCDE-FGHIJ-KLMNO-PQRST' } })
  fireEvent.click(screen.getByRole('button', { name: 'Vào Tour' }))
}
function deferredResponse() {
  let resolve!: (value: Response) => void
  const promise = new Promise<Response>(done => { resolve = done })
  return { promise, resolve }
}
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } })
  useAuthStore.getState().setAuth('account-token', { userId: 'rep', username: 'rep', role: 'Representative' })
})
afterEach(() => { client.clear(); vi.unstubAllGlobals(); useAuthStore.getState().logout() })

it('recovers a cookie session without an access code, account JWT or account refresh', async () => {
  const fetch = vi.fn(async (_url: string, options: RequestInit) => {
    expect(options.credentials).toBe('include')
    expect(options.method).toBe('POST')
    expect(options.body).toBeUndefined()
    expect((options.headers as Record<string, string>).Authorization).toBeUndefined()
    return response()
  })
  vi.stubGlobal('fetch', fetch)
  mount()
  expect(await screen.findByText('Bạn đã vào phòng chờ')).toBeVisible()
  expect(screen.queryByLabelText('Mã truy cập')).not.toBeInTheDocument()
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(fetch.mock.calls[0][0]).toMatch(/\/session$/)
  expect(useAuthStore.getState().accessToken).toBe('account-token')
})

it('normalizes GUID casing to match the backend cookie path', async () => {
  const canonical = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  const fetch = vi.fn(async () => response({ ...info, tourId: canonical }))
  vi.stubGlobal('fetch', fetch)
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/tour/' + canonical.toUpperCase()]}>
    <Routes><Route path="/tour/:tourId" element={<StudentTourPage />} /></Routes>
  </MemoryRouter></QueryClientProvider>)
  await screen.findByText('Bạn đã vào phòng chờ')
  expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/' + canonical + '/session'), expect.anything())
})

it('keeps a rejected network join retryable with its access code', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => { if (url.endsWith('/join')) throw new TypeError('offline'); return response(null, 401) }))
  mount()
  await screen.findByLabelText('Mã truy cập')
  submitCode()
  expect(await screen.findByRole('alert')).toHaveTextContent('Không kết nối được hệ thống')
  expect(screen.getByLabelText('Mã truy cập')).toHaveValue('ABCDE-FGHIJ-KLMNO-PQRST')
  expect(screen.getByRole('button', { name: 'Vào Tour' })).toBeEnabled()
})

it('does not claim a successful leave on network failure and recovers a missing cookie explicitly', async () => {
  let sessionValid = true
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.endsWith('/leave')) { sessionValid = false; throw new TypeError('reply lost') }
    return sessionValid ? response() : response(null, 401)
  }))
  mount()
  await screen.findByText('Bạn đã vào phòng chờ')
  fireEvent.click(screen.getByRole('button', { name: 'Thoát phiên' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Không kết nối được hệ thống')
  expect(screen.getByText('Bạn đã vào phòng chờ')).toBeVisible()
  await act(async () => { await client.refetchQueries({ queryKey: key }) })
  await screen.findByLabelText('Mã truy cập')
  expect(screen.queryByText('Bạn đã vào phòng chờ')).not.toBeInTheDocument()
})

it.each([
  [400, 'Mã truy cập không hợp lệ'], [401, 'Mã hoặc phiên đã hết hạn'],
  [403, 'Nguồn truy cập không được phép'], [409, 'Lời mời đang được dùng'], [429, 'Bạn đã thử quá nhiều lần'],
])('handles join HTTP %s without refreshing or logging out an account', async (status, message) => {
  const fetch = vi.fn(async (url: string) => response(null, url.endsWith('/join') ? status as number : 401))
  vi.stubGlobal('fetch', fetch)
  mount()
  await screen.findByLabelText('Mã truy cập')
  submitCode()
  expect(await screen.findByRole('alert')).toHaveTextContent(message as string)
  expect(screen.getByLabelText('Mã truy cập')).toHaveValue('ABCDE-FGHIJ-KLMNO-PQRST')
  expect(fetch.mock.calls.some(([url]) => url.includes('/api/auth/'))).toBe(false)
  expect(useAuthStore.getState().accessToken).toBe('account-token')
})

it.each([401, 403, 409])('removes cached room access when a session heartbeat returns %s', async status => {
  let calls = 0
  vi.stubGlobal('fetch', vi.fn(async () => ++calls === 1 ? response() : response(null, status)))
  mount()
  await screen.findByText('Bạn đã vào phòng chờ')
  await act(async () => { await client.refetchQueries({ queryKey: key }) })
  await waitFor(() => expect(screen.queryByText('Bạn đã vào phòng chờ')).not.toBeInTheDocument())
  expect(screen.getByLabelText('Mã truy cập')).toBeVisible()
})

it('retains stale room information during a network failure and allows explicit recovery', async () => {
  let connected = true
  vi.stubGlobal('fetch', vi.fn(async () => { if (!connected) throw new TypeError('offline'); return response() }))
  mount()
  await screen.findByText('Bạn đã vào phòng chờ')
  connected = false
  await act(async () => { await client.refetchQueries({ queryKey: key }) })
  expect(screen.getByText('Bạn đã vào phòng chờ')).toBeVisible()
  expect(await screen.findByRole('alert')).toHaveTextContent('thông tin hiển thị có thể đã cũ')
  expect(screen.getByRole('alert')).not.toHaveTextContent('10 phút')
  connected = true
  fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra lại phiên' }))
  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
})

it('does not let a late anonymous heartbeat discard a successful join', async () => {
  const heartbeat = deferredResponse()
  let sessions = 0
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.endsWith('/join')) return response()
    return ++sessions === 1 ? response(null, 401) : heartbeat.promise
  }))
  mount()
  await screen.findByLabelText('Mã truy cập')
  fireEvent.change(screen.getByLabelText('Mã truy cập'), { target: { value: 'ABCDE-FGHIJ-KLMNO-PQRST' } })
  const submit = screen.getByRole('button', { name: 'Vào Tour' })
  let pending!: Promise<void>
  act(() => { pending = client.refetchQueries({ queryKey: key }); fireEvent.click(submit) })
  await waitFor(() => expect(sessions).toBe(2))
  await screen.findByText('Bạn đã vào phòng chờ')
  await act(async () => { heartbeat.resolve(response(null, 401)); await pending })
  expect(screen.getByText('Bạn đã vào phòng chờ')).toBeVisible()
})

it('cancels a pending heartbeat before leave and keeps the room cache empty', async () => {
  const heartbeat = deferredResponse()
  let sessions = 0
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.endsWith('/leave')) return response(null)
    return ++sessions === 1 ? response() : heartbeat.promise
  }))
  mount()
  await screen.findByText('Bạn đã vào phòng chờ')
  let pending!: Promise<void>
  act(() => { pending = client.refetchQueries({ queryKey: key }) })
  await waitFor(() => expect(sessions).toBe(2))
  fireEvent.click(screen.getByRole('button', { name: 'Thoát phiên' }))
  await screen.findByLabelText('Mã truy cập')
  await act(async () => { heartbeat.resolve(response()); await pending })
  expect(client.getQueryData(key)).toBeNull()
  expect(screen.queryByText('Bạn đã vào phòng chờ')).not.toBeInTheDocument()
})

it('checks the new Tour session after leaving another Tour instead of carrying over local logout state', async () => {
  const fetch = vi.fn(async (url: string) => url.endsWith('/leave') ? response(null) : response({ ...info, tourName: url.includes(otherTour) ? 'Tour khác' : info.tourName }))
  vi.stubGlobal('fetch', fetch)
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/tour/' + tourId]}>
    <Link to={'/tour/' + otherTour}>Tour khác</Link><Routes><Route path="/tour/:tourId" element={<StudentTourPage />} /></Routes>
  </MemoryRouter></QueryClientProvider>)
  await screen.findByText('Bạn đã vào phòng chờ')
  fireEvent.click(screen.getByRole('button', { name: 'Thoát phiên' }))
  await screen.findByLabelText('Mã truy cập')
  fireEvent.click(screen.getByRole('link', { name: 'Tour khác' }))
  expect(await screen.findByText('Bạn đã vào phòng chờ')).toBeVisible()
  expect(fetch.mock.calls.some(([url]) => url.includes(otherTour) && url.endsWith('/session'))).toBe(true)
})
