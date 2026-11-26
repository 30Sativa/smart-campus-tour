import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../api/client'
import { EvidencePhotoField, EvidencePhotoList } from './EvidencePhotos'
import { useEvidencePhotos } from './use-evidence-photos'
import { evidenceFullSrc, evidencePhotoErrorText, evidencePhotoProblem, evidenceThumbSrc } from './api/evidence-photos'

const upload = vi.hoisted(() => vi.fn())
vi.mock('./api/evidence-photos', async importOriginal => ({ ...(await importOriginal<typeof import('./api/evidence-photos')>()), uploadEvidencePhoto: upload }))

const stored = (n: number) => `https://res.cloudinary.com/demo-cloud/image/upload/smartcampus/technical-evidence/u/${n}`
const pick = (input: HTMLElement, files: File[]) => fireEvent.change(input, { target: { files } })
const picker = () => screen.getByLabelText(/Ảnh bằng chứng/, { selector: 'input' })
const photo = (name: string, type = 'image/jpeg', size = 1000) => new File([new Uint8Array(size)], name, { type })

function Harness({ onChange = () => {} }: { onChange?: () => void }) {
  const state = useEvidencePhotos(onChange)
  return <><EvidencePhotoField id="photos" state={state} /><output aria-label="saved">{state.photos.join(',')}</output><output aria-label="busy">{String(state.uploading)}</output></>
}

afterEach(() => upload.mockReset())

describe('evidence photo files', () => {
  it('takes JPG, PNG, WebP and HEIC up to 10 MB, HEIC also without a MIME type', () => {
    expect(evidencePhotoProblem(photo('a.jpg'))).toBeNull()
    expect(evidencePhotoProblem(photo('a.heic', 'image/heic'))).toBeNull()
    expect(evidencePhotoProblem(photo('IMG_1.HEIC', ''))).toBeNull()
    expect(evidencePhotoProblem(photo('a.gif', 'image/gif'))).toMatch(/chỉ nhận ảnh/)
    expect(evidencePhotoProblem(photo('a.pdf', ''))).toMatch(/chỉ nhận ảnh/)
    expect(evidencePhotoProblem(photo('big.png', 'image/png', 10 * 1024 * 1024 + 1))).toMatch(/vượt giới hạn 10 MB/)
  })

  it('shows a Cloudinary photo small and in a format every browser opens', () => {
    expect(evidenceThumbSrc(stored(1), 64)).toBe('https://res.cloudinary.com/demo-cloud/image/upload/c_fill,h_128,w_128,f_auto,q_auto/smartcampus/technical-evidence/u/1')
    expect(evidenceFullSrc(stored(1))).toBe('https://res.cloudinary.com/demo-cloud/image/upload/f_auto,q_auto/smartcampus/technical-evidence/u/1')
    expect(evidenceThumbSrc('https://example.com/a.jpg', 64)).toBe('https://example.com/a.jpg')
  })

  it('says when the server has no Cloudinary, without blocking the note', () => {
    expect(evidencePhotoErrorText(new ApiError(503, 'x'))).toMatch(/chưa cấu hình Cloudinary.*chỉ với ghi chú/)
  })
})

describe('EvidencePhotoField', () => {
  it('uploads each picked photo, keeps the stored address and lets it be removed', async () => {
    upload.mockResolvedValueOnce(stored(1)).mockResolvedValueOnce(stored(2))
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    pick(picker(), [photo('a.jpg'), photo('b.png', 'image/png')])

    await waitFor(() => expect(screen.getByLabelText('saved')).toHaveTextContent(`${stored(1)},${stored(2)}`))
    expect(screen.getByLabelText('busy')).toHaveTextContent('false')
    expect(screen.getAllByRole('img')).toHaveLength(2)
    expect(onChange).toHaveBeenCalledTimes(2)

    fireEvent.click(screen.getByRole('button', { name: 'Bỏ ảnh bằng chứng 1' }))
    expect(screen.getByLabelText('saved')).toHaveTextContent(stored(2))
    expect(onChange).toHaveBeenCalledTimes(3)
  })

  it('keeps at most five photos and says how many were left out', async () => {
    upload.mockImplementation(async (file: File) => stored(Number(file.name[0])))
    render(<Harness />)
    pick(picker(), [1, 2, 3, 4, 5, 6, 7].map(n => photo(`${n}.jpg`)))

    expect(await screen.findByRole('alert')).toHaveTextContent('tối đa 5 ảnh, đã bỏ 2 ảnh')
    await waitFor(() => expect(screen.getAllByRole('img')).toHaveLength(5))
    expect(upload).toHaveBeenCalledTimes(5)
    expect(screen.getByRole('button', { name: /Thêm ảnh/ })).toBeDisabled()
  })

  it('reports a failed upload, saves nothing for it and is busy while a photo is uploading', async () => {
    let finish: (url: string) => void = () => {}
    upload.mockImplementationOnce(() => new Promise<string>(resolve => { finish = resolve }))
      .mockRejectedValueOnce(new ApiError(503, 'x'))
    render(<Harness />)
    const input = picker()
    pick(input, [photo('slow.jpg')])
    expect(screen.getByLabelText('busy')).toHaveTextContent('true')
    expect(screen.getByRole('button', { name: 'Hủy tải slow.jpg' })).toBeInTheDocument()
    await act(async () => finish(stored(9)))
    expect(screen.getByLabelText('busy')).toHaveTextContent('false')

    pick(input, [photo('fail.jpg')])
    expect(await screen.findByRole('alert')).toHaveTextContent(/chưa cấu hình Cloudinary/)
    expect(screen.getByLabelText('saved')).toHaveTextContent(stored(9))
  })
})

describe('EvidencePhotoList', () => {
  it('links each saved photo and shows nothing for a record without photos', () => {
    const { container, rerender } = render(<EvidencePhotoList urls={[]} />)
    expect(container).toBeEmptyDOMElement()
    rerender(<EvidencePhotoList urls={[stored(1), stored(2)]} />)
    expect(screen.getAllByRole('link').map(link => link.getAttribute('href'))).toEqual([evidenceFullSrc(stored(1)), evidenceFullSrc(stored(2))])
  })
})
