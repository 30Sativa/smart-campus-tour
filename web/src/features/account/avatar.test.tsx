import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../../stores/auth-store'
import { avatarSrc } from '../../components/ui/avatar-src'
import { AccountSettings } from './AccountSettings'

// ADR-0064: the account's own avatar, sent straight to Cloudinary with a backend-signed ticket.
const STORED = 'https://res.cloudinary.com/demo-cloud/image/upload/smartcampus/avatars/0123456789abcdef0123456789abcdef/fedcba9876543210fedcba9876543210'
const PROFILE = { id: 'u1', username: 'rep.one', fullName: 'Nguyễn Văn A', role: 'Representative', isActive: true,
  createdAt: '2026-11-01T00:00:00Z', updatedAt: null, avatarUrl: null as string | null }
const TICKET = { uploadUrl: 'https://api.cloudinary.com/v1_1/demo-cloud/image/upload',
  fields: { api_key: 'key', signature: 'sig', public_id: 'smartcampus/avatars/x/y' }, storedUrl: STORED, maxBytes: 10 * 1024 * 1024 }

class FakeUpload {
  static last: FakeUpload | null = null
  static status = 200
  body: FormData | null = null
  url = ''
  status = 0
  responseText = '{}'
  upload: { onprogress: ((event: { lengthComputable: boolean; loaded: number; total: number }) => void) | null } = { onprogress: null }
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  onabort: (() => void) | null = null
  open(_method: string, url: string) { this.url = url }
  send(body: FormData) {
    this.body = body
    FakeUpload.last = this
    queueMicrotask(() => { this.status = FakeUpload.status; this.onload?.() })
  }
  abort() { this.onabort?.() }
}

let profile = { ...PROFILE }
let writes: { path: string; method: string; body: unknown }[] = []
const ok = (data: unknown, status = 200) => new Response(JSON.stringify({ success: status < 300, data }), { status })

beforeEach(() => {
  profile = { ...PROFILE }
  writes = []
  FakeUpload.last = null
  FakeUpload.status = 200
  useAuthStore.setState({ isAuthReady: true, isAuthenticated: true, accessToken: 'test-token', user: { userId: 'u1', username: 'rep.one', role: 'Representative' } })
  vi.stubGlobal('XMLHttpRequest', FakeUpload)
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input), 'http://localhost').pathname
    const method = init?.method ?? 'GET'
    if (path === '/api/account/me' && method === 'GET') return ok(profile)
    if (path === '/api/account/me/avatar-upload') return ok(TICKET)
    if (path === '/api/account/me/avatar' && method === 'PUT') {
      const body = JSON.parse(String(init?.body)) as { avatarUrl: string | null }
      writes.push({ path, method, body })
      profile = { ...profile, avatarUrl: body.avatarUrl }
      return ok(profile)
    }
    return ok(null, 404)
  }))
})
afterEach(() => { vi.unstubAllGlobals(); useAuthStore.getState().logout() })

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}><MemoryRouter><AccountSettings section="profile" /></MemoryRouter></QueryClientProvider>)
}
const pick = (file: File) => act(async () => {
  fireEvent.change(screen.getByLabelText('Chọn ảnh đại diện'), { target: { files: [file] } })
})

describe('avatarSrc', () => {
  it('asks Cloudinary for a face-cropped square at twice the size, in the lightest format', () => {
    expect(avatarSrc(STORED, 32)).toBe(STORED.replace('/image/upload/', '/image/upload/c_fill,g_face,h_64,w_64,f_auto,q_auto/'))
    expect(avatarSrc('https://example.test/a.png', 32)).toBe('https://example.test/a.png')
  })
})

describe('profile avatar', () => {
  it('shows initials until a picture is uploaded, then saves only the stored reference and shows it', async () => {
    const { container } = mount()
    expect(await screen.findByRole('button', { name: 'Tải ảnh lên' })).toBeEnabled()
    expect(container.querySelector('img')).toBeNull()

    await pick(new File([new Uint8Array(10)], 'me.jpg', { type: 'image/jpeg' }))

    await waitFor(() => expect(writes).toEqual([{ path: '/api/account/me/avatar', method: 'PUT', body: { avatarUrl: STORED } }]))
    expect(FakeUpload.last!.url).toBe(TICKET.uploadUrl)
    expect(FakeUpload.last!.body!.get('signature')).toBe('sig')
    expect(FakeUpload.last!.body!.get('file')).toBeInstanceOf(File)
    await waitFor(() => expect(container.querySelector('img')).toHaveAttribute('src', avatarSrc(STORED, 72)))
    expect(screen.getByRole('button', { name: 'Đổi ảnh' })).toBeEnabled()
  })

  it('removes the picture', async () => {
    profile = { ...PROFILE, avatarUrl: STORED }
    const { container } = mount()
    fireEvent.click(await screen.findByRole('button', { name: 'Bỏ ảnh' }))
    await waitFor(() => expect(writes.at(-1)?.body).toEqual({ avatarUrl: null }))
    await waitFor(() => expect(container.querySelector('img')).toBeNull())
  })

  it('says why when Cloudinary refuses the picture, and saves nothing', async () => {
    FakeUpload.status = 400
    mount()
    await screen.findByRole('button', { name: 'Tải ảnh lên' })
    await pick(new File([new Uint8Array(10)], 'me.jpg', { type: 'image/jpeg' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Cloudinary từ chối ảnh')
    expect(writes).toEqual([])
  })

  it('says so when the server has no Cloudinary configuration', async () => {
    const original = vi.mocked(globalThis.fetch).getMockImplementation()!
    vi.mocked(globalThis.fetch).mockImplementation(async (input, init) =>
      String(input).endsWith('/avatar-upload') ? new Response('{}', { status: 503 }) : original(input, init))
    mount()
    await screen.findByRole('button', { name: 'Tải ảnh lên' })
    await pick(new File([new Uint8Array(10)], 'me.jpg', { type: 'image/jpeg' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('chưa cấu hình Cloudinary')
  })
})
