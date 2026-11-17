import { act, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../../../stores/auth-store'
import { FallbackVideoField } from './FallbackVideoField'
import { isUploadedFallbackVideo, uploadFallbackVideo } from './api/fallback-video'

// ADR-0063: Staff uploads the fallback video straight to Cloudinary with a backend-signed ticket.
const STORED = 'https://res.cloudinary.com/demo-cloud/video/authenticated/smartcampus/tours/fallback/0123456789abcdef0123456789abcdef.mp4'
const TICKET = {
  uploadUrl: 'https://api.cloudinary.com/v1_1/demo-cloud/video/upload',
  fields: { api_key: 'key', signature: 'sig', public_id: 'smartcampus/tours/fallback/0123456789abcdef0123456789abcdef', type: 'authenticated' },
  storedUrl: STORED,
  maxBytes: 100 * 1024 * 1024,
}

/** A stand-in for the browser's XMLHttpRequest that answers like Cloudinary. */
class FakeUpload {
  static last: FakeUpload | null = null
  static answer = { status: 200, body: '{}' }
  method = ''
  url = ''
  body: FormData | null = null
  status = 0
  responseText = ''
  upload: { onprogress: ((event: { lengthComputable: boolean; loaded: number; total: number }) => void) | null } = { onprogress: null }
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  onabort: (() => void) | null = null
  open(method: string, url: string) { this.method = method; this.url = url }
  send(body: FormData) {
    this.body = body
    FakeUpload.last = this
    this.upload.onprogress?.({ lengthComputable: true, loaded: 50, total: 100 })
    queueMicrotask(() => {
      this.status = FakeUpload.answer.status
      this.responseText = FakeUpload.answer.body
      this.onload?.()
    })
  }
  abort() { this.onabort?.() }
}

function file(bytes = 10) {
  return new File([new Uint8Array(bytes)], 'du-phong.mp4', { type: 'video/mp4' })
}

beforeEach(() => {
  useAuthStore.setState({ isAuthReady: true, isAuthenticated: true, accessToken: 'test-token', user: { userId: 'staff', username: 'staff', role: 'Staff' } })
  FakeUpload.last = null
  FakeUpload.answer = { status: 200, body: '{}' }
  vi.stubGlobal('XMLHttpRequest', FakeUpload)
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ success: true, data: TICKET }), { status: 200 })))
})
afterEach(() => { vi.unstubAllGlobals(); useAuthStore.getState().logout() })

describe('uploadFallbackVideo', () => {
  it('asks the API for a signed ticket, then posts the file and every signed field to Cloudinary', async () => {
    const progress: number[] = []
    await expect(uploadFallbackVideo(file(), percent => progress.push(percent))).resolves.toBe(STORED)

    const [url, init] = vi.mocked(globalThis.fetch).mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/staff/manage/tours/fallback-video-upload')
    expect(init.method).toBe('POST')
    const sent = FakeUpload.last!
    expect([sent.method, sent.url]).toEqual(['POST', TICKET.uploadUrl])
    for (const [name, value] of Object.entries(TICKET.fields)) expect(sent.body!.get(name)).toBe(value)
    expect(sent.body!.get('file')).toBeInstanceOf(File)
    expect(progress).toEqual([50])
  })

  it('refuses a file over the limit before sending anything to Cloudinary', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ success: true, data: { ...TICKET, maxBytes: 5 } }), { status: 200 })))
    await expect(uploadFallbackVideo(file(10), () => {})).rejects.toMatchObject({ reason: 'too-large' })
    expect(FakeUpload.last).toBeNull()
  })

  it("reports Cloudinary's own reason when it refuses the video", async () => {
    FakeUpload.answer = { status: 400, body: JSON.stringify({ error: { message: 'Invalid video file' } }) }
    await expect(uploadFallbackVideo(file(), () => {})).rejects.toThrow('Cloudinary từ chối video: Invalid video file')
  })

  it('recognises only references an upload made', () => {
    expect(isUploadedFallbackVideo(STORED)).toBe(true)
    expect(isUploadedFallbackVideo('https://example.com/video.mp4')).toBe(false)
    expect(isUploadedFallbackVideo(STORED.replace('authenticated', 'upload'))).toBe(false)
    expect(isUploadedFallbackVideo(null)).toBe(false)
  })
})

function Harness({ initial = '' }: { initial?: string }) {
  const [value, setValue] = useState(initial)
  return <><FallbackVideoField value={value} onChange={setValue} /><output aria-label="Giá trị">{value}</output></>
}

describe('FallbackVideoField', () => {
  it('uploads a picked file and keeps only the reference to save with the Tour', async () => {
    render(<Harness />)
    expect(screen.getByText(/Chưa có/)).toBeInTheDocument()
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Chọn tệp video dự phòng'), { target: { files: [file()] } })
    })
    expect(await screen.findByText(/Đã tải lên. Cloudinary cần vài phút/)).toBeInTheDocument()
    expect(screen.getByLabelText('Giá trị')).toHaveTextContent(STORED)
    expect(screen.getByRole('button', { name: 'Thay video' })).toBeEnabled()
  })

  it('says when the server has no Cloudinary configuration', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 503 })))
    render(<Harness />)
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Chọn tệp video dự phòng'), { target: { files: [file()] } })
    })
    expect(await screen.findByRole('alert')).toHaveTextContent('chưa cấu hình Cloudinary')
    expect(screen.getByLabelText('Giá trị')).toHaveTextContent('')
  })

  it('flags an older typed link that students will not see, and removes a video', () => {
    render(<Harness initial="https://example.com/video.mp4" />)
    expect(screen.getByText(/không phát cho học sinh/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Bỏ video' }))
    expect(screen.getByLabelText('Giá trị')).toHaveTextContent('')
    expect(screen.getByRole('button', { name: 'Tải video lên' })).toBeInTheDocument()
  })
})
