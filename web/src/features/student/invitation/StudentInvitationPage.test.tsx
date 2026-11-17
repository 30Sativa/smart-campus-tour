import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Link, MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { SESSION_CHECK_WATCHDOG_MS, StudentInvitationPage } from './StudentInvitationPage'
import { ENTER_TOUR_LABEL } from './invitation-labels'
import { QueryProvider } from '../../../app/providers/query-provider'
import StudentTourPage from '../../../routes/student/StudentTourPage'
import { useAuthStore } from '../../../stores/auth-store'

// These invitation cases exercise a Tour without a configured livestream.
vi.mock('../../quest-stream/quest-stream-config', async importOriginal => ({
  ...await importOriginal<typeof import('../../quest-stream/quest-stream-config')>(),
  QUEST_DEV_WHEP_URL: null,
}))

const tourId = '11111111-1111-1111-1111-111111111111'
const otherTour = '22222222-2222-2222-2222-222222222222'
const key = ['student-invitation', tourId]
const view = { stops: [
  { order: 1, poiId: 'p1', name: 'Thư viện trung tâm', description: 'Ba tầng sách.', narrationText: 'Đây là thư viện trung tâm.', audioUrl: null, narrationSeconds: 40, dwellSeconds: 120 },
  { order: 2, poiId: 'p2', name: 'AI Lab', description: null, narrationText: null, audioUrl: null, narrationSeconds: null, dwellSeconds: 60 },
], progress: null }
const info = { tourId, tourName: 'Tour được mời', tourState: 'SCHEDULED', scheduledStartAt: '2026-10-20T02:00:00Z',
  invitationExpiresAt: '2026-10-21T02:00:00Z', rowType: 'INDIVIDUAL', fallbackVideoUrl: null }
let client: QueryClient
function response(data: unknown = info, status = 200) {
  return new Response(JSON.stringify({ success: status === 200, data }), { status })
}
function fetchCalls() {
  return (vi.mocked(globalThis.fetch).mock.calls as unknown as [string][]).map(([url]) => url)
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
  const fetch = vi.fn(async (url: string) => url.endsWith('/view') ? response(view) : response())
  vi.stubGlobal('fetch', fetch)
  mount()
  expect(await screen.findByText('Bạn đã vào phòng chờ')).toBeVisible()
  expect(screen.queryByLabelText('Mã truy cập')).not.toBeInTheDocument()
  await waitFor(() => expect(fetch.mock.calls.some(([url]) => url.endsWith('/view'))).toBe(true))
  const calls = fetch.mock.calls as unknown as [string, RequestInit][]
  expect(calls[0][0]).toMatch(/\/session$/)
  expect(calls.filter(([url]) => url.endsWith('/session'))).toHaveLength(1)
  for (const [url, options] of calls) {
    expect(url).toMatch(/\/(session|view)$/)
    expect(options.credentials).toBe('include')
    expect(options.body).toBeUndefined()
    expect(new Headers(options.headers).get('Authorization')).toBeNull()
    expect(options.method).toBe(url.endsWith('/session') ? 'POST' : undefined)
  }
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
    if (url.endsWith('/view')) return response(view)
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
    if (url.endsWith('/view')) return response(view)
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

it('shows the route stops in the waiting room once the view loads', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => url.endsWith('/view') ? response(view) : response()))
  mount()
  expect(await screen.findByText('Xem trước 02 điểm dừng')).toBeVisible()
  expect(screen.getByText('Thư viện trung tâm')).toBeVisible()
  expect(screen.queryByRole('button', { name: /Micro/ })).not.toBeInTheDocument()
})

it('keeps the waiting room usable when the route view fails', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => url.endsWith('/view') ? response(null, 500) : response()))
  mount()
  expect(await screen.findByText('Bạn đã vào phòng chờ')).toBeVisible()
  await waitFor(() => expect(fetchCalls().some(url => url.endsWith('/view'))).toBe(true))
  expect(screen.queryByText(/^Xem trước/)).not.toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

it('shows the live Tour with the current stop, its narration and no map tab', async () => {
  const running = { ...info, tourState: 'RUNNING' }
  const live = { ...view, progress: { step: 'OBSERVING', currentPoiId: 'p1', lastArrivedPoiId: 'p1', needsAssistance: false, isHeld: false } }
  vi.stubGlobal('fetch', vi.fn(async (url: string) => url.endsWith('/view') ? response(live) : response(running)))
  mount()
  expect(await screen.findByText('Đang giới thiệu Thư viện trung tâm')).toBeVisible()
  expect(screen.getByRole('heading', { name: 'Thư viện trung tâm', level: 2 })).toBeVisible()
  expect(screen.getByText('Thuyết minh điểm dừng')).toBeVisible()
  expect(screen.queryByRole('tab', { name: /Bản đồ/ })).not.toBeInTheDocument()
  expect(screen.getAllByRole('tab')).toHaveLength(3)
  expect(screen.getByText(/Livestream chưa được kết nối/)).toBeVisible()
  expect(screen.getByText('Đang gắn ngữ cảnh: Điểm Thư viện trung tâm và thông tin chung')).toBeInTheDocument()
})

it('says the Tour is running when the robot has not reported progress yet', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => url.endsWith('/view') ? response(view) : response({ ...info, tourState: 'RUNNING' })))
  mount()
  expect(await screen.findByRole('heading', { name: 'Buổi tham quan đang diễn ra', level: 2 })).toBeVisible()
  fireEvent.click(screen.getByRole('tab', { name: /Lộ trình/ }))
  expect((await screen.findAllByText('AI Lab')).length).toBeGreaterThan(0)
})

it.each([['CANCELLED', 'Buổi tham quan đã kết thúc sớm'], ['COMPLETED', 'Hoàn thành chuyến tham quan!']])(
  'shows the end screen for a %s Tour', async (tourState, title) => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.endsWith('/view') ? response(view) : response({ ...info, tourState })))
    mount()
    expect(await screen.findByRole('heading', { name: title })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Thoát phiên' })).toBeEnabled()
  })

it('stops live playback within 10 s after the invitation is revoked or reissued', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  try {
    let revoked = false
    const running = { ...info, tourState: 'RUNNING', fallbackVideoUrl: '/videos/home.mp4' }
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      url.endsWith('/view') ? response(view) : revoked ? response(null, 401) : response(running)))
    const { container } = mount()
    await screen.findByText('Video dự phòng · chế độ suy giảm')
    expect(container.querySelector('video')).not.toBeNull()

    revoked = true
    await act(async () => { await vi.advanceTimersByTimeAsync(6000) })
    expect(await screen.findByLabelText('Mã truy cập')).toBeVisible()
    expect(container.querySelector('video')).toBeNull()
  } finally {
    vi.useRealTimers()
  }
})

it('offers no fallback video in the waiting room (fallback is a running-Tour degraded mode)', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => url.endsWith('/view') ? response(view) : response({ ...info, fallbackVideoUrl: 'https://example.com/fallback' })))
  mount()
  expect(await screen.findByText('Bạn đã vào phòng chờ')).toBeVisible()
  expect(screen.queryByRole('link', { name: /video dự phòng/i })).toBeNull()
})

it('shows the code form first so a phone sees it before the photo and introduction', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => response(null, 401)))
  mount()
  const form = (await screen.findByRole('heading', { name: 'Nhập mã truy cập' })).closest('section')!
  const story = screen.getByRole('heading', { name: /Khám phá campus/ }).closest('section')!
  expect(form).toHaveClass('st-entry-form')
  expect(story).toHaveClass('st-entry-story')
  expect(form.compareDocumentPosition(story) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(form.contains(screen.getByRole('img'))).toBe(false)
})

it('labels the code button with the shared constant the invitation email names', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => response(null, 401)))
  mount()
  expect(ENTER_TOUR_LABEL).toBe('Vào Tour')
  expect(await screen.findByRole('button', { name: ENTER_TOUR_LABEL })).toBeInTheDocument()
})

it('re-checks the session when an account sign-out clears the query cache mid-check', async () => {
  // Root cause: a first visit's cookie refresh is refused, auth logout bumps the session revision and the app
  // QueryProvider clears every query, silently cancelling this check and leaving its observer waiting.
  const first = deferredResponse()
  let sessions = 0
  const fetch = vi.fn(async (url: string) => {
    if (url.endsWith('/view')) return response(view)
    return ++sessions === 1 ? first.promise : response()
  })
  vi.stubGlobal('fetch', fetch)
  render(<QueryProvider><StudentInvitationPage tourId={tourId} /></QueryProvider>)
  await waitFor(() => expect(sessions).toBe(1))
  expect(screen.getByText('Đang kiểm tra phiên…')).toBeInTheDocument()
  act(() => { useAuthStore.getState().logout() })
  expect(await screen.findByText('Bạn đã vào phòng chờ')).toBeVisible()
  expect(sessions).toBe(2)
  first.resolve(response())
})

it('offers the code form and a retry after 8 s without a session answer', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'], shouldAdvanceTime: true })
  try {
    const hanging = deferredResponse()
    let sessions = 0
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/view')) return response(view)
      return ++sessions === 1 ? hanging.promise : response()
    }))
    mount()
    expect(screen.getByText('Đang kiểm tra phiên…')).toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(SESSION_CHECK_WATCHDOG_MS - 100) })
    expect(screen.queryByLabelText('Mã truy cập')).not.toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(200) })
    expect(screen.getByRole('status')).toHaveTextContent('Chưa kiểm tra được phiên')
    expect(screen.getByLabelText('Mã truy cập')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }))
    expect(await screen.findByText('Bạn đã vào phòng chờ')).toBeVisible()
    expect(sessions).toBe(2)
  } finally {
    vi.useRealTimers()
  }
})

it.each([
  ['offline', () => { throw new TypeError('offline') }],
  ['cancelled', () => { throw new DOMException('The user aborted a request.', 'AbortError') }],
  ['server error', () => response(null, 503)],
])('shows the code form with "Chưa kiểm tra được phiên" when the check fails (%s)', async (_name, fail) => {
  let sessions = 0
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.endsWith('/view')) return response(view)
    return ++sessions === 1 ? fail() : response()
  }))
  mount()
  expect(await screen.findByRole('status')).toHaveTextContent('Chưa kiểm tra được phiên')
  expect(screen.getByLabelText('Mã truy cập')).toBeVisible()
  expect(screen.queryByRole('button', { name: 'Kiểm tra lại phiên' })).not.toBeInTheDocument()
  expect(screen.queryByText(/Không kết nối được hệ thống/)).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }))
  expect(await screen.findByText('Bạn đã vào phòng chờ')).toBeVisible()
})

function conflictResponse(code: string, message: string, fields?: Record<string, string[]>) {
  return new Response(JSON.stringify({ success: false, message, data: null, errors: { code, ...(fields ? { fields } : {}) } }), { status: 409 })
}
const heldMessage = 'Trình duyệt này đã mất kết nối quá 2 phút nên phiên cũ đang bị giữ. Nhờ đại diện hoặc Staff cấp mã mới để vào ngay.'

it('shows the backend sentence and the wait for RECONNECT_WINDOW_EXPIRED on join', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => url.endsWith('/join')
    ? conflictResponse('RECONNECT_WINDOW_EXPIRED', heldMessage, { retryAfterSeconds: ['290'] }) : response(null, 401)))
  mount()
  await screen.findByLabelText('Mã truy cập')
  submitCode()
  expect(await screen.findByRole('alert')).toHaveTextContent(`${heldMessage} Thử lại sau khoảng 5 phút.`)
})

it('does not repeat the wait when the backend sentence already names it', async () => {
  const sentence = 'Phiên cũ đang bị giữ. Nhờ đại diện hoặc Staff cấp mã mới để vào ngay, hoặc thử lại sau khoảng 5 phút.'
  vi.stubGlobal('fetch', vi.fn(async (url: string) => url.endsWith('/join')
    ? conflictResponse('RECONNECT_WINDOW_EXPIRED', sentence, { retryAfterSeconds: ['290'] }) : response(null, 401)))
  mount()
  await screen.findByLabelText('Mã truy cập')
  submitCode()
  const alert = await screen.findByRole('alert')
  expect(alert).toHaveTextContent(sentence)
  expect(alert.textContent?.match(/thử lại sau/gi)).toHaveLength(1)
})

it('shows only the backend sentence for RECONNECT_WINDOW_EXPIRED without retryAfterSeconds', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => url.endsWith('/join')
    ? conflictResponse('RECONNECT_WINDOW_EXPIRED', heldMessage) : response(null, 401)))
  mount()
  await screen.findByLabelText('Mã truy cập')
  submitCode()
  const alert = await screen.findByRole('alert')
  expect(alert).toHaveTextContent(heldMessage)
  expect(alert).not.toHaveTextContent('Thử lại sau')
})

it('shows the backend sentence for INVITATION_IN_USE', async () => {
  const sentence = 'Mã này đang được dùng trên một trình duyệt khác. Nhờ đại diện hoặc Staff cấp mã mới nếu đó không phải bạn.'
  vi.stubGlobal('fetch', vi.fn(async (url: string) => url.endsWith('/join')
    ? conflictResponse('INVITATION_IN_USE', sentence) : response(null, 401)))
  mount()
  await screen.findByLabelText('Mã truy cập')
  submitCode()
  expect(await screen.findByRole('alert')).toHaveTextContent(sentence)
})

it('stops polling the session after RECONNECT_WINDOW_EXPIRED and waits for the viewer', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  try {
    const fetch = vi.fn(async () => conflictResponse('RECONNECT_WINDOW_EXPIRED', heldMessage, { retryAfterSeconds: ['600'] }))
    vi.stubGlobal('fetch', fetch)
    mount()
    expect(await screen.findByText(`${heldMessage} Thử lại sau khoảng 10 phút.`)).toBeVisible()
    await act(async () => { await vi.advanceTimersByTimeAsync(65_000) })
    expect(fetchCalls().filter(url => url.endsWith('/session'))).toHaveLength(1)
    expect(screen.getByLabelText('Mã truy cập')).toBeVisible()
  } finally {
    vi.useRealTimers()
  }
})

const SESSION_ENDED = 'Phiên xem đã kết thúc. Mã có thể đã bị thu hồi hoặc thay bằng mã mới; kiểm tra email mới nhất rồi nhập lại mã, hoặc liên hệ đại diện đoàn.'

/** The backend's 409 for a proven viewer of a Tour that is over (docs/architecture.md, AccessTour). */
function tourEndedReply(tourState: 'COMPLETED' | 'CANCELLED') {
  return new Response(JSON.stringify({ success: false,
    message: tourState === 'COMPLETED' ? 'Buổi tham quan đã kết thúc.' : 'Buổi tham quan đã bị hủy.',
    errors: { code: 'TOUR_ENDED', fields: { tourState: [tourState] } } }), { status: 409 })
}

it('keeps the end screen when the session check of a RUNNING Tour turns into 409 TOUR_ENDED', async () => {
  // The real backend never answers 200 COMPLETED: it goes from 200 RUNNING straight to 409 TOUR_ENDED.
  let ended = false
  vi.stubGlobal('fetch', vi.fn(async (url: string) => url.endsWith('/view') ? response(view)
    : ended ? tourEndedReply('COMPLETED') : response({ ...info, tourState: 'RUNNING' })))
  mount()
  await screen.findByRole('heading', { name: 'Buổi tham quan đang diễn ra', level: 2 })
  ended = true
  await act(async () => { await client.refetchQueries({ queryKey: key }) })
  expect(await screen.findByRole('heading', { name: 'Hoàn thành chuyến tham quan!' })).toBeVisible()
  expect(screen.queryByLabelText('Mã truy cập')).not.toBeInTheDocument()
  expect(screen.queryByText(SESSION_ENDED)).toBeNull()
  expect(screen.queryByText(/Đang mất kết nối/)).toBeNull()
  expect(screen.queryByRole('button', { name: 'Kiểm tra lại phiên' })).toBeNull()
  // Leaving the ended Tour needs no server call: its session is already gone.
  fireEvent.click(screen.getAllByRole('button', { name: 'Thoát phiên' })[0])
  expect(await screen.findByLabelText('Mã truy cập')).toBeVisible()
  expect(screen.queryByRole('alert')).toBeNull()
  expect(fetchCalls().some(url => url.endsWith('/leave'))).toBe(false)
})

it('says a never-started Tour was called off when a waiting room gets TOUR_ENDED CANCELLED, and stops checking', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  try {
    let ended = false
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.endsWith('/view') ? response(view)
      : ended ? tourEndedReply('CANCELLED') : response()))
    mount()
    await screen.findByText('Bạn đã vào phòng chờ')
    ended = true
    await act(async () => { await client.refetchQueries({ queryKey: key }) })
    // It never ran, so it was cancelled, not ended early (a Tour cancelled mid-way keeps "kết thúc sớm").
    expect(await screen.findByRole('heading', { name: 'Buổi tham quan đã bị hủy' })).toBeVisible()
    expect(screen.getByText('Buổi tham quan đã bị hủy trước khi bắt đầu. Liên hệ đại diện đoàn nếu cần biết thêm.')).toBeVisible()
    expect(screen.queryByText(/kết thúc sớm/)).toBeNull()
    const checks = () => fetchCalls().filter(url => url.endsWith('/session')).length
    const before = checks()
    await act(async () => { await vi.advanceTimersByTimeAsync(65_000) })
    expect(checks()).toBe(before)
    expect(screen.queryByText(SESSION_ENDED)).toBeNull()
  } finally {
    vi.useRealTimers()
  }
})

it('says the Tour has ended on the code form when a first join gets 409 TOUR_ENDED', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => url.endsWith('/join') ? tourEndedReply('COMPLETED') : response(null, 401)))
  mount()
  await screen.findByLabelText('Mã truy cập')
  submitCode()
  expect(await screen.findByRole('alert')).toHaveTextContent('Buổi tham quan đã kết thúc.')
  expect(screen.getByLabelText('Mã truy cập')).toBeVisible()
  expect(screen.queryByText(SESSION_ENDED)).toBeNull()
})

it('says the Tour has ended, not that the code was revoked, when a reload finds TOUR_ENDED with nothing known', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => tourEndedReply('COMPLETED')))
  mount()
  expect(await screen.findByRole('alert')).toHaveTextContent('Buổi tham quan đã kết thúc.')
  expect(screen.getByLabelText('Mã truy cập')).toBeVisible()
  expect(screen.queryByText(SESSION_ENDED)).toBeNull()
  expect(screen.queryByRole('button', { name: 'Kiểm tra lại phiên' })).toBeNull()
})

it('says why the room closed when a session this tab held is refused with 401', async () => {
  let revoked = false
  vi.stubGlobal('fetch', vi.fn(async (url: string) => url.endsWith('/view') ? response(view) : revoked ? response(null, 401) : response()))
  mount()
  await screen.findByText('Bạn đã vào phòng chờ')
  revoked = true
  await act(async () => { await client.refetchQueries({ queryKey: key }) })
  expect(await screen.findByLabelText('Mã truy cập')).toBeVisible()
  expect(screen.getByRole('alert')).toHaveTextContent(SESSION_ENDED)
})

it('stays silent about the 401 of a first visit without a session', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => response(null, 401)))
  mount()
  expect(await screen.findByLabelText('Mã truy cập')).toBeVisible()
  expect(screen.queryByRole('alert')).toBeNull()
  expect(screen.queryByText(SESSION_ENDED)).toBeNull()
  expect(screen.getByText(/Mỗi lời mời dùng trên một trình duyệt;/)).toBeInTheDocument()
})

it.each([
  [(4 * 24 + 9) * 3_600_000 + 5 * 60_000 + 30_000, 'Còn 4 ngày 9 giờ'],
  [2 * 3_600_000 + 5 * 60_000 + 30_000, /^2:05:(29|30)$/],
])('shows the waiting-room countdown in days at 24 h or more and as h:mm:ss below', async (ahead, label) => {
  const start = new Date(Date.now() + (ahead as number)).toISOString()
  vi.stubGlobal('fetch', vi.fn(async (url: string) => url.endsWith('/view') ? response(view) : response({ ...info, scheduledStartAt: start })))
  mount()
  const timer = await screen.findByRole('timer')
  expect(timer.querySelector('b')!.textContent).toMatch(typeof label === 'string' ? new RegExp(`^${label}$`) : label)
  if (typeof label === 'string') expect(timer).toHaveAccessibleName(`${label} tới giờ bắt đầu`)
})
