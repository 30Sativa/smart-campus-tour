import { useSyncExternalStore } from 'react'

function subscribe(onChange: () => void) {
  document.addEventListener('visibilitychange', onChange)
  return () => document.removeEventListener('visibilitychange', onChange)
}

/**
 * False while the tab is hidden (another tab, minimised window, locked phone).
 * Live video players stop pulling the stream then, so a forgotten tab costs no
 * bandwidth, and reconnect when the viewer comes back.
 */
export function usePageVisible() {
  return useSyncExternalStore(subscribe, () => document.visibilityState !== 'hidden', () => true)
}
