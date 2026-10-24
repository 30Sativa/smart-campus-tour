import { useQuery } from '@tanstack/react-query'
import { QUEST_STATUS_URL } from './quest-stream-config'
import { QUEST_REFRESH_MS, fetchQuestDevice } from './quest-device'

const REQUEST_TIMEOUT_MS = 4_000

/** Aborts when React Query cancels or after a few seconds, whichever comes first. */
function withTimeout(signal: AbortSignal): { signal: AbortSignal; done: () => void } {
  const controller = new AbortController()
  const abort = () => controller.abort()
  const timer = window.setTimeout(abort, REQUEST_TIMEOUT_MS)
  if (signal.aborted) abort()
  else signal.addEventListener('abort', abort, { once: true })
  return {
    signal: controller.signal,
    done: () => {
      window.clearTimeout(timer)
      signal.removeEventListener('abort', abort)
    },
  }
}

/**
 * The headset reading from quest-stream, refreshed every 5 s while the page
 * is open. Disabled (and `configured: false`) when VITE_QUEST_STATUS_URL is
 * unset: nothing is invented in its place.
 */
export function useQuestDevice(url: string | null = QUEST_STATUS_URL) {
  const query = useQuery({
    queryKey: ['quest-device', url],
    queryFn: async ({ signal }) => {
      const request = withTimeout(signal)
      try {
        return await fetchQuestDevice(url as string, request.signal)
      } finally {
        request.done()
      }
    },
    enabled: Boolean(url),
    refetchInterval: QUEST_REFRESH_MS,
    refetchIntervalInBackground: false,
    retry: 1,
    staleTime: 0,
  })
  return { ...query, configured: Boolean(url) }
}
