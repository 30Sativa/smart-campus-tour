import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../../../../stores/auth-store'
import type { TalkFeed, TalkMessage } from '../../../tour-talk/talk-types'
import { TourTalkPanel } from './TourTalkPanel'

const message = (patch: Partial<TalkMessage>): TalkMessage => ({
  id: crypto.randomUUID(), seq: 1, from: 'STAFF', text: null, hasAudio: false, audioAvailable: false, audioDurationMs: null,
  staffName: 'Lan Staff', viewerName: null, viewerClass: null, viewerRowType: null, mine: false, sentAt: '2026-11-25T08:00:00Z', ...patch,
})

let feed: TalkFeed
let posts: FormData[]

beforeEach(() => {
  posts = []
  feed = { epoch: 'e1', lastSeq: 3, open: true, canSend: true, messages: [
    message({ seq: 1, text: 'Các bạn muốn đi điểm nào tiếp theo?' }),
    message({ seq: 2, from: 'VIEWER', text: 'Thư viện ạ', staffName: null, viewerName: 'Nguyễn An', viewerClass: '12A1', viewerRowType: 'INDIVIDUAL' }),
    message({ seq: 3, from: 'STAFF', hasAudio: true, audioAvailable: false, audioDurationMs: 4000 }),
  ] }
  useAuthStore.getState().setAuth('t', { userId: 'staff-1', username: 'lan', role: 'Staff' })
  vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === 'POST') posts.push(init.body as FormData)
    const data = init?.method === 'POST' ? feed.messages[0] : feed
    return new Response(JSON.stringify({ success: true, data }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }))
})
afterEach(() => { vi.unstubAllGlobals(); useAuthStore.getState().logout() })

const mount = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
  <TourTalkPanel tourId="tour-1" operatorName="Lan Staff" />
</QueryClientProvider>)

describe('Tour talk on the live console (ADR-0070)', () => {
  it('shows the Operator messages and who replied, and sends text to every Viewer', async () => {
    mount()
    const list = within(await screen.findByRole('list', { name: 'Tin nhắn' }))
    expect(await list.findByText('Thư viện ạ')).toBeInTheDocument()
    expect(list.getByText('Nguyễn An')).toBeInTheDocument()
    expect(list.getByText('· 12A1')).toBeInTheDocument()
    expect(list.getByText('Đoạn ghi âm không còn lưu')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Tin nhắn cho người xem'), { target: { value: '  Chúng ta sắp tới thư viện  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Gửi tin nhắn' }))
    await waitFor(() => expect(posts).toHaveLength(1))
    expect(posts[0].get('text')).toBe('Chúng ta sắp tới thư viện')
    expect(posts[0].get('audio')).toBeNull()
    const [url] = vi.mocked(globalThis.fetch).mock.calls.find(([, init]) => init?.method === 'POST')!
    expect(String(url)).toMatch(/\/api\/staff\/manage\/tours\/tour-1\/talk$/)
  })

  it('sends a quick prompt in one press', async () => {
    mount()
    fireEvent.click(await screen.findByRole('button', { name: 'Các bạn có câu hỏi gì về điểm này không?' }))
    await waitFor(() => expect(posts[0]?.get('text')).toBe('Các bạn có câu hỏi gì về điểm này không?'))
  })

  it('lets another Staff read without sending', async () => {
    feed = { ...feed, canSend: false }
    mount()
    expect(await screen.findByText(/Chỉ Lan Staff mới nói chuyện/)).toBeInTheDocument()
    expect(screen.queryByLabelText('Tin nhắn cho người xem')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Ghi âm/ })).not.toBeInTheDocument()
  })
})
