import { apiClient } from '../../../../api/client'
import type { ApiResponse } from '../../../../api/contracts/shared'

/**
 * ADR-0063: what the backend signs for one direct upload of a Tour's fallback video to Cloudinary. The file goes
 * straight from the browser to Cloudinary (never through the API); `storedUrl` is then saved as the Tour's
 * `fallbackVideoUrl`. It is an unsigned reference to an authenticated asset: it plays nowhere by itself, and students
 * watch it only through the relay with a token.
 */
export type FallbackVideoTicket = { uploadUrl: string; fields: Record<string, string>; storedUrl: string; maxBytes: number }

export class FallbackVideoUploadError extends Error {
  readonly reason: 'too-large' | 'refused' | 'network'

  constructor(reason: 'too-large' | 'refused' | 'network', message: string) {
    super(message)
    this.name = 'FallbackVideoUploadError'
    this.reason = reason
  }
}

const UPLOADED = /^https:\/\/res\.cloudinary\.com\/[A-Za-z][A-Za-z0-9-]{1,127}\/video\/authenticated\/smartcampus\/tours\/fallback\/[0-9a-f]{32}\.mp4$/

/** A reference made by the upload below; anything else (an older typed link) is not played to students. */
export function isUploadedFallbackVideo(url: string | null | undefined): boolean {
  return !!url && UPLOADED.test(url.trim())
}

/** Signs, then uploads `file`; resolves with the reference to save on the Tour. */
export async function uploadFallbackVideo(file: File, onProgress: (percent: number) => void, signal?: AbortSignal): Promise<string> {
  const ticket = (await apiClient<ApiResponse<FallbackVideoTicket>>('/api/staff/manage/tours/fallback-video-upload',
    { method: 'POST', signal })).data
  if (!ticket) throw new FallbackVideoUploadError('refused', 'Máy chủ không trả về thông tin tải lên.')
  if (file.size > ticket.maxBytes) {
    throw new FallbackVideoUploadError('too-large',
      `Video nặng ${megabytes(file.size)} MB, vượt giới hạn ${megabytes(ticket.maxBytes)} MB. Hãy xuất lại ở 720p rồi thử lại.`)
  }
  const form = new FormData()
  for (const [name, value] of Object.entries(ticket.fields)) form.append(name, value)
  form.append('file', file)
  await send(ticket.uploadUrl, form, onProgress, signal)
  return ticket.storedUrl
}

function megabytes(bytes: number) {
  return Math.ceil(bytes / (1024 * 1024))
}

/** Cloudinary's own error text, `{"error":{"message":"…"}}`, when it sent one. */
function cloudinaryMessage(body: string) {
  try {
    const message = (JSON.parse(body) as { error?: { message?: unknown } }).error?.message
    return typeof message === 'string' && message ? message : null
  } catch {
    return null
  }
}

/**
 * Cloudinary is not the backend, so this is not `apiClient`; XMLHttpRequest because only it reports upload progress
 * for a file of up to 100 MB.
 */
function send(url: string, form: FormData, onProgress: (percent: number) => void, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'))
    const request = new XMLHttpRequest()
    request.open('POST', url)
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.min(100, Math.round((event.loaded * 100) / event.total)))
    }
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) return resolve()
      const reason = cloudinaryMessage(request.responseText)
      reject(new FallbackVideoUploadError('refused', reason ? `Cloudinary từ chối video: ${reason}` : `Cloudinary từ chối video (HTTP ${request.status}).`))
    }
    request.onerror = () => reject(new FallbackVideoUploadError('network', 'Không gửi được video lên Cloudinary. Kiểm tra mạng rồi thử lại.'))
    request.onabort = () => reject(new DOMException('Aborted', 'AbortError'))
    signal?.addEventListener('abort', () => request.abort(), { once: true })
    request.send(form)
  })
}
