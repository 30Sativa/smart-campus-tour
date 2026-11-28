import { act, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../../../stores/auth-store'
import { FallbackVideoField } from './FallbackVideoField'
import { draftOf, formatMark, marksOf, parseMark, type MarkDraft } from './fallback-video-marks'

// ADR-0075 stage 2: with the fallback video, Staff set the second each stop of the route starts in it.
const STORED = 'https://res.cloudinary.com/demo-cloud/video/authenticated/smartcampus/tours/fallback/0123456789abcdef0123456789abcdef.mp4'
const STOPS = [{ id: 'stop-1', order: 1, name: 'Cổng chính' }, { id: 'stop-2', order: 2, name: 'Thư viện' }]

describe('fallback video marks', () => {
  it('reads phút:giây or plain seconds and prints them back', () => {
    expect(parseMark('1:35')).toBe(95)
    expect(parseMark('95')).toBe(95)
    expect(parseMark('1:02:05')).toBe(3725)
    expect(parseMark('  ')).toBeNull()
    expect(parseMark('1:75')).toBeUndefined()
    expect(parseMark('abc')).toBeUndefined()
    expect(formatMark(95)).toBe('1:35')
    expect(formatMark(3725)).toBe('1:02:05')
    expect(formatMark(4.9)).toBe('0:04')
  })

  it('keeps the filled stops in recording order and says why the marks cannot be saved', () => {
    expect(marksOf({ texts: { 'stop-1': '2:00', 'stop-2': '0:10' }, duration: null }, STOPS))
      .toEqual({ marks: [{ revisionStopId: 'stop-2', startSeconds: 10 }, { revisionStopId: 'stop-1', startSeconds: 120 }], problem: null })
    expect(marksOf({ texts: { 'stop-1': '', 'stop-2': '0:10' }, duration: null }, STOPS).marks).toHaveLength(1)
    expect(marksOf({ texts: { 'stop-1': 'x' }, duration: null }, STOPS).problem).toBe('sửa mốc thời gian theo dạng phút:giây')
    expect(marksOf({ texts: { 'stop-1': '3:00' }, duration: 120.5 }, STOPS).problem).toBe('đặt mốc thời gian trong độ dài video')
    expect(draftOf([{ revisionStopId: 'stop-1', startSeconds: 95 }]).texts).toEqual({ 'stop-1': '1:35' })
  })
})

class FakeUpload {
  status = 0
  responseText = '{}'
  upload = { onprogress: null }
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  onabort: (() => void) | null = null
  open() {}
  send() { queueMicrotask(() => { this.status = 200; this.onload?.() }) }
  abort() { this.onabort?.() }
}

beforeEach(() => {
  useAuthStore.setState({ isAuthReady: true, isAuthenticated: true, accessToken: 'test-token', user: { userId: 'staff', username: 'staff', role: 'Staff' } })
  vi.stubGlobal('XMLHttpRequest', FakeUpload)
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ success: true, data: {
    uploadUrl: 'https://api.cloudinary.com/v1_1/demo-cloud/video/upload', fields: {}, storedUrl: STORED, maxBytes: 100 * 1024 * 1024,
  } }), { status: 200 })))
})
afterEach(() => { vi.unstubAllGlobals(); useAuthStore.getState().logout() })

function Harness({ initial = '', marks = { texts: {}, duration: null } }: { initial?: string; marks?: MarkDraft }) {
  const [value, setValue] = useState(initial)
  const [draft, setDraft] = useState(marks)
  return <>
    <FallbackVideoField value={value} onChange={setValue} stops={STOPS} marks={draft} onMarksChange={setDraft} />
    <output aria-label="Mốc">{JSON.stringify(marksOf(draft, STOPS))}</output>
  </>
}

describe('FallbackVideoField marks', () => {
  it('asks for marks only once there is a video', () => {
    render(<Harness />)
    expect(screen.queryByRole('group', { name: 'Mốc thời gian của từng điểm trong video' })).toBeNull()
  })

  it('takes a typed mark per stop and flags one that is not phút:giây', () => {
    render(<Harness initial={STORED} marks={draftOf([{ revisionStopId: 'stop-1', startSeconds: 0 }])} />)
    expect(screen.getByLabelText('1. Cổng chính')).toHaveValue('0:00')
    fireEvent.change(screen.getByLabelText('2. Thư viện'), { target: { value: '1:35' } })
    expect(screen.getByLabelText('Mốc')).toHaveTextContent('"startSeconds":95')
    fireEvent.change(screen.getByLabelText('2. Thư viện'), { target: { value: '1:99' } })
    expect(screen.getByText('Nhập dạng phút:giây, ví dụ 1:35.')).toBeInTheDocument()
    expect(screen.getByLabelText('2. Thư viện')).toHaveAttribute('aria-invalid', 'true')
  })

  it('plays the uploaded file so Staff take the moment, and starts a new video without marks', async () => {
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:preview'), revokeObjectURL: vi.fn() }))
    render(<Harness initial={STORED} marks={draftOf([{ revisionStopId: 'stop-1', startSeconds: 30 }])} />)
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Chọn tệp video dự phòng'), { target: { files: [new File([new Uint8Array(4)], 'v.mp4', { type: 'video/mp4' })] } })
    })
    expect(await screen.findByText(/Đã tải lên/)).toBeInTheDocument()
    expect(screen.getByLabelText('1. Cổng chính')).toHaveValue('')

    const player = screen.getByLabelText('Xem lại video dự phòng') as HTMLVideoElement
    Object.defineProperty(player, 'duration', { value: 120, configurable: true })
    fireEvent(player, new Event('loadedmetadata'))
    expect(screen.getByText('Độ dài video: 2:00')).toBeInTheDocument()
    // One capture button fills the stops in order and moves on to the next stop without a mark.
    expect(screen.getByText('Đã đặt 0/2 điểm')).toBeInTheDocument()
    player.currentTime = 3.2
    fireEvent.click(screen.getByRole('button', { name: 'Lấy thời điểm này cho Cổng chính' }))
    expect(screen.getByLabelText('1. Cổng chính')).toHaveValue('0:03')
    player.currentTime = 42.7
    fireEvent.click(screen.getByRole('button', { name: 'Lấy thời điểm này cho Thư viện' }))
    expect(screen.getByLabelText('2. Thư viện')).toHaveValue('0:42')
    expect(screen.getByRole('button', { name: 'Mọi điểm đã có mốc' })).toBeDisabled()
    // Focusing a stop picks it again, to redo its mark.
    fireEvent.focus(screen.getByLabelText('1. Cổng chính'))
    player.currentTime = 5
    fireEvent.click(screen.getByRole('button', { name: 'Lấy thời điểm này cho Cổng chính' }))
    expect(screen.getByLabelText('1. Cổng chính')).toHaveValue('0:05')
    expect(screen.getByText('Đã đặt 2/2 điểm')).toBeInTheDocument()
    // The mark sits on the video's timeline; clicking it seeks back there.
    player.currentTime = 0
    fireEvent.click(screen.getByRole('button', { name: 'Tua tới Thư viện' }))
    expect(player.currentTime).toBe(42)

    fireEvent.change(screen.getByLabelText('1. Cổng chính'), { target: { value: '2:30' } })
    expect(screen.getByText('Mốc này nằm sau cuối video.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Bỏ video' }))
    expect(screen.queryByLabelText('2. Thư viện')).toBeNull()
    expect(screen.getByLabelText('Mốc')).toHaveTextContent('"marks":[]')
  })
})
