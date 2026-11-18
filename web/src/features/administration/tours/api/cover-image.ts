import { ApiError, apiClient } from '../../../../api/client'
import type { ApiResponse } from '../../../../api/contracts/shared'

/**
 * What the backend signs for one direct upload of a Tour's cover image to Cloudinary. The public ID is fixed by the
 * Tour, so uploading again replaces the image; nothing is saved on the Tour itself (see `api/tour-cover.ts`).
 */
export type TourCoverTicket = { uploadUrl: string; fields: Record<string, string>; maxBytes: number }

/** What the picker takes; Cloudinary is told the same list (`allowed_formats`). */
export const COVER_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif']
/** The backend's limit, checked before asking it, so a too-large file fails at once. */
export const COVER_IMAGE_MAX_BYTES = 10 * 1024 * 1024

export class TourCoverUploadError extends Error {
  readonly reason: 'invalid' | 'refused' | 'network'

  constructor(reason: 'invalid' | 'refused' | 'network', message: string) {
    super(message)
    this.name = 'TourCoverUploadError'
    this.reason = reason
  }
}

/** Why `file` cannot be a cover image, or null when it can. */
export function coverImageProblem(file: File): string | null {
  if (!COVER_IMAGE_TYPES.includes(file.type)) return 'Chỉ nhận ảnh JPG, PNG, WebP hoặc AVIF.'
  if (file.size > COVER_IMAGE_MAX_BYTES) return `Ảnh nặng ${Math.ceil(file.size / (1024 * 1024))} MB, vượt giới hạn 10 MB.`
  return null
}

/** Signs, then uploads `file` as the cover image of Tour `tourId`. */
export async function uploadTourCover(tourId: string, file: File, signal?: AbortSignal): Promise<void> {
  const problem = coverImageProblem(file)
  if (problem) throw new TourCoverUploadError('invalid', problem)
  const ticket = (await apiClient<ApiResponse<TourCoverTicket>>(`/api/staff/manage/tours/${encodeURIComponent(tourId)}/cover-image-upload`,
    { method: 'POST', signal })).data
  if (!ticket) throw new TourCoverUploadError('refused', 'Máy chủ không trả về thông tin tải lên.')
  if (file.size > ticket.maxBytes) throw new TourCoverUploadError('invalid', 'Ảnh vượt giới hạn dung lượng của máy chủ.')
  const form = new FormData()
  for (const [name, value] of Object.entries(ticket.fields)) form.append(name, value)
  form.append('file', file)
  let response: Response
  try {
    // Cloudinary is not the backend, so this is not `apiClient`.
    response = await fetch(ticket.uploadUrl, { method: 'POST', body: form, signal })
  } catch (error) {
    if (signal?.aborted) throw error
    throw new TourCoverUploadError('network', 'Không gửi được ảnh lên Cloudinary. Kiểm tra mạng rồi thử lại.')
  }
  if (!response.ok) {
    const reason = await cloudinaryMessage(response)
    throw new TourCoverUploadError('refused', reason ? `Cloudinary từ chối ảnh: ${reason}` : `Cloudinary từ chối ảnh (HTTP ${response.status}).`)
  }
}

/** Cloudinary's own error text, `{"error":{"message":"…"}}`, when it sent one. */
async function cloudinaryMessage(response: Response) {
  try {
    const message = ((await response.json()) as { error?: { message?: unknown } }).error?.message
    return typeof message === 'string' && message ? message : null
  } catch {
    return null
  }
}

/** What to tell Staff when the cover upload after a save failed; the Tour itself is already saved. */
export function coverUploadError(error: unknown) {
  if (error instanceof TourCoverUploadError) return error.message
  if (error instanceof ApiError && error.status === 503) return 'Máy chủ chưa cấu hình Cloudinary nên chưa tải được ảnh Tour.'
  if (error instanceof ApiError && (error.status === 401 || error.status === 403)) return 'Phiên đăng nhập không còn quyền tải ảnh. Đăng nhập lại rồi thử lại.'
  return 'Không tải được ảnh lên. Vui lòng thử lại ở trang Sửa Tour.'
}
