import { ApiError, apiClient } from '../../../api/client'
import type { ApiResponse } from '../../../api/contracts/shared'
import { CloudinaryUploadError, megabytes, uploadToCloudinary } from '../../../api/cloudinary-upload'

/**
 * ADR-0073: what the backend signs for one evidence photo. Each ticket names a new public ID under the checker's own
 * folder, so a photo is never replaced; `storedUrl` is what the deployment check, POI verification or route test run
 * sends in `evidencePhotoUrls` once Cloudinary has accepted the file.
 */
export type EvidencePhotoTicket = { uploadUrl: string; fields: Record<string, string>; storedUrl: string; maxBytes: number; maxPhotos: number }

/** The backend's limits, checked before asking it so a wrong file fails at once. */
export const EVIDENCE_PHOTO_MAX = 5
export const EVIDENCE_PHOTO_MAX_BYTES = 10 * 1024 * 1024
export const EVIDENCE_PHOTO_ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif'
const TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
// Windows browsers often give a phone's HEIC photo no MIME type, so the extension decides then.
const EXTENSIONS = /\.(jpe?g|png|webp|heic|heif)$/i

export class EvidencePhotoError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EvidencePhotoError'
  }
}

/** Why `file` cannot be an evidence photo, or null when it can. */
export function evidencePhotoProblem(file: File): string | null {
  if (file.type ? !TYPES.includes(file.type) : !EXTENSIONS.test(file.name)) return `${file.name}: chỉ nhận ảnh JPG, PNG, WebP hoặc HEIC.`
  if (file.size > EVIDENCE_PHOTO_MAX_BYTES) return `${file.name}: ảnh nặng ${megabytes(file.size)} MB, vượt giới hạn 10 MB.`
  return null
}

/** Signs, uploads `file` and returns the address to save with the record. */
export async function uploadEvidencePhoto(file: File, onProgress: (percent: number) => void, signal?: AbortSignal): Promise<string> {
  const problem = evidencePhotoProblem(file)
  if (problem) throw new EvidencePhotoError(problem)
  const ticket = (await apiClient<ApiResponse<EvidencePhotoTicket>>('/api/technical/evidence-photo-upload', { method: 'POST', signal })).data
  if (!ticket) throw new EvidencePhotoError('Máy chủ không trả về thông tin tải ảnh lên.')
  if (file.size > ticket.maxBytes) throw new EvidencePhotoError(`${file.name}: ảnh vượt giới hạn dung lượng của máy chủ.`)
  await uploadToCloudinary(ticket.uploadUrl, ticket.fields, file, 'ảnh', onProgress, signal)
  return ticket.storedUrl
}

/** What to tell Technical when a photo did not upload; the form and its other photos are kept. */
export function evidencePhotoErrorText(error: unknown) {
  if (error instanceof EvidencePhotoError || error instanceof CloudinaryUploadError) return error.message
  if (error instanceof ApiError && error.status === 503) return 'Máy chủ chưa cấu hình Cloudinary nên chưa tải được ảnh bằng chứng. Vẫn lưu được kết quả chỉ với ghi chú.'
  if (error instanceof ApiError && (error.status === 401 || error.status === 403)) return 'Phiên đăng nhập không còn quyền tải ảnh. Đăng nhập lại rồi thử lại.'
  return 'Không tải được ảnh lên. Vui lòng thử lại.'
}

/** A small preview of a stored photo: cropped, lightest format for this browser (HEIC included), sharp on 2x screens. */
export function evidenceThumbSrc(url: string, size: number) {
  const marker = '/image/upload/'
  const at = url.indexOf(marker)
  if (!url.startsWith('https://res.cloudinary.com/') || at < 0) return url
  return `${url.slice(0, at + marker.length)}c_fill,h_${size * 2},w_${size * 2},f_auto,q_auto/${url.slice(at + marker.length)}`
}

/** The full photo, in a format every browser opens (a HEIC original otherwise downloads instead of showing). */
export function evidenceFullSrc(url: string) {
  const marker = '/image/upload/'
  const at = url.indexOf(marker)
  if (!url.startsWith('https://res.cloudinary.com/') || at < 0) return url
  return `${url.slice(0, at + marker.length)}f_auto,q_auto/${url.slice(at + marker.length)}`
}
