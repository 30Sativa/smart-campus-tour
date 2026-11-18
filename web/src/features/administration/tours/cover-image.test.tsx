import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../../../stores/auth-store'
import { CoverImageField } from './CoverImageField'
import { coverImageProblem, uploadTourCover } from './api/cover-image'

// A Tour's cover image goes straight to Cloudinary under a public ID the backend fixes from the Tour id.
const TOUR_ID = 'e7f145d4-3e04-4540-985a-29d8222d75af'
const TICKET = {
  uploadUrl: 'https://api.cloudinary.com/v1_1/demo-cloud/image/upload',
  fields: { api_key: 'key', signature: 'sig', public_id: 'smartcampus/tours/cover/e7f145d43e044540985a29d8222d75af', overwrite: 'true' },
  maxBytes: 10 * 1024 * 1024,
}

const image = (bytes = 10, type = 'image/jpeg', name = 'anh-tour.jpg') => new File([new Uint8Array(bytes)], name, { type })

/** The API answers the signing call; Cloudinary answers the upload with `cloudinary`. */
function stubNetwork(cloudinary: Response = new Response('{}', { status: 200 })) {
  const fetchMock = vi.fn(async (url: string) => url.startsWith('https://api.cloudinary.com/')
    ? cloudinary
    : new Response(JSON.stringify({ success: true, data: TICKET }), { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

beforeEach(() => {
  useAuthStore.setState({ isAuthReady: true, isAuthenticated: true, accessToken: 'test-token', user: { userId: 'staff', username: 'staff', role: 'Staff' } })
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:preview'), revokeObjectURL: vi.fn() }))
})
afterEach(() => { vi.unstubAllGlobals(); useAuthStore.getState().logout() })

describe('uploadTourCover', () => {
  it("asks the API to sign the Tour's upload, then posts the image and every signed field to Cloudinary", async () => {
    const fetchMock = stubNetwork()
    await uploadTourCover(TOUR_ID, image())

    const [signUrl, signInit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(signUrl).toContain(`/api/staff/manage/tours/${TOUR_ID}/cover-image-upload`)
    expect(signInit.method).toBe('POST')
    const [uploadUrl, uploadInit] = fetchMock.mock.calls[1] as unknown as [string, RequestInit]
    expect(uploadUrl).toBe(TICKET.uploadUrl)
    const body = uploadInit.body as FormData
    for (const [name, value] of Object.entries(TICKET.fields)) expect(body.get(name)).toBe(value)
    expect(body.get('file')).toBeInstanceOf(File)
  })

  it('refuses a file that is not an image or is too large before asking the API', async () => {
    const fetchMock = stubNetwork()
    await expect(uploadTourCover(TOUR_ID, image(10, 'application/pdf', 'x.pdf'))).rejects.toMatchObject({ reason: 'invalid' })
    await expect(uploadTourCover(TOUR_ID, image(11 * 1024 * 1024))).rejects.toMatchObject({ reason: 'invalid' })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(coverImageProblem(image(10, 'image/png', 'a.png'))).toBeNull()
  })

  it("reports Cloudinary's own reason when it refuses the image", async () => {
    stubNetwork(new Response(JSON.stringify({ error: { message: 'Invalid image file' } }), { status: 400 }))
    await expect(uploadTourCover(TOUR_ID, image())).rejects.toThrow('Cloudinary từ chối ảnh: Invalid image file')
  })
})

describe('CoverImageField', () => {
  function Harness() {
    const [file, setFile] = useState<File | null>(null)
    return <><CoverImageField file={file} onChange={setFile} /><output>{file?.name ?? 'none'}</output></>
  }

  it('previews a picked image and keeps it for the save; a wrong file is refused with a reason', () => {
    render(<Harness />)
    expect(screen.getByText('Chưa có. Đại diện trường sẽ thấy ảnh minh họa mẫu.')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Chọn ảnh Tour'), { target: { files: [image(10, 'text/plain', 'ghi-chu.txt')] } })
    expect(screen.getByRole('alert')).toHaveTextContent('Chỉ nhận ảnh JPG, PNG, WebP hoặc AVIF.')
    expect(screen.getByText('none')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Chọn ảnh Tour'), { target: { files: [image()] } })
    expect(screen.getByText('anh-tour.jpg')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Xem trước ảnh Tour đã chọn' })).toHaveAttribute('src', 'blob:preview')
    expect(screen.getByText('Đã chọn anh-tour.jpg. Ảnh được tải lên khi lưu Tour.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Bỏ ảnh đã chọn' }))
    expect(screen.getByText('none')).toBeInTheDocument()
  })

  it('shows the current image of an edited Tour, and the empty state when it has none', () => {
    render(<CoverImageField file={null} onChange={() => {}} currentUrl="https://res.cloudinary.com/demo-cloud/image/upload/x" />)
    const current = screen.getByRole('img', { name: 'Ảnh Tour hiện tại' })
    fireEvent.error(current)
    expect(screen.queryByRole('img', { name: 'Ảnh Tour hiện tại' })).toBeNull()
    expect(screen.getByText('Chưa có. Đại diện trường sẽ thấy ảnh minh họa mẫu.')).toBeInTheDocument()
  })
})
