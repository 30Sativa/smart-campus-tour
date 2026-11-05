import { apiClient } from '../../../api/client'

export const REPRESENTATIVE_READ_TIMEOUT_MS = 15_000

/** Bound reads, including a stalled session refresh, without retrying mutations. */
export async function representativeRead<T>(path: string, signal?: AbortSignal): Promise<T> {
  signal?.throwIfAborted()
  const controller = new AbortController()
  const cancel = () => controller.abort(signal?.reason)
  signal?.addEventListener('abort', cancel, { once: true })
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const error = new DOMException('Representative request timed out', 'TimeoutError')
      reject(error)
      controller.abort(error)
    }, REPRESENTATIVE_READ_TIMEOUT_MS)
  })
  try {
    return await Promise.race([apiClient<T>(path, { signal: controller.signal }), deadline])
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', cancel)
  }
}
