/**
 * Sends one file straight from the browser to Cloudinary with fields the backend signed (ADR-0063, ADR-0064).
 * Cloudinary is not the backend, so this is not `apiClient`; XMLHttpRequest because only it reports upload progress.
 */
export class CloudinaryUploadError extends Error {
  readonly reason: 'refused' | 'network'

  constructor(reason: 'refused' | 'network', message: string) {
    super(message)
    this.name = 'CloudinaryUploadError'
    this.reason = reason
  }
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

/** Posts `file` with every signed field to `url`; `what` names the file in Vietnamese error text ("video", "ảnh"). */
export function uploadToCloudinary(url: string, fields: Record<string, string>, file: File, what: string,
  onProgress: (percent: number) => void, signal?: AbortSignal) {
  const form = new FormData()
  for (const [name, value] of Object.entries(fields)) form.append(name, value)
  form.append('file', file)
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
      reject(new CloudinaryUploadError('refused', reason ? `Cloudinary từ chối ${what}: ${reason}` : `Cloudinary từ chối ${what} (HTTP ${request.status}).`))
    }
    request.onerror = () => reject(new CloudinaryUploadError('network', `Không gửi được ${what} lên Cloudinary. Kiểm tra mạng rồi thử lại.`))
    request.onabort = () => reject(new DOMException('Aborted', 'AbortError'))
    signal?.addEventListener('abort', () => request.abort(), { once: true })
    request.send(form)
  })
}

export function megabytes(bytes: number) {
  return Math.ceil(bytes / (1024 * 1024))
}
