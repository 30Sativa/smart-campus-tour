import { useEffect, useState } from 'react'

/**
 * The current time, re-read every `intervalMs`. For elapsed clocks and "3 phút
 * trước" labels, which must move between data refreshes. One timer per caller,
 * cleaned up with it.
 */
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs])
  return now
}
