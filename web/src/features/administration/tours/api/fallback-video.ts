import { apiClient } from '../../../../api/client'
import type { ApiResponse } from '../../../../api/contracts/shared'
import { CloudinaryUploadError, megabytes, uploadToCloudinary } from '../../../../api/cloudinary-upload'

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
  try {
    await uploadToCloudinary(ticket.uploadUrl, ticket.fields, file, 'video', onProgress, signal)
  } catch (error) {
    throw error instanceof CloudinaryUploadError ? new FallbackVideoUploadError(error.reason, error.message) : error
  }
  return ticket.storedUrl
}
