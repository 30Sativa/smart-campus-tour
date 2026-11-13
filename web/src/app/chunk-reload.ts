/**
 * After a new deploy, a tab opened earlier still runs the old build and asks for lazy chunks whose hashed
 * file names no longer exist ("Failed to fetch dynamically imported module"). Reloading fetches the new
 * index.html and its new chunk names. The timestamp guard stops a reload loop when the server is really down.
 */
const RELOAD_KEY = 'chunk-reload-at'
const RELOAD_GUARD_MS = 10_000

const CHUNK_ERROR =
  /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS|Loading (CSS )?chunk .* failed/i

export function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : ''
  return CHUNK_ERROR.test(message)
}

/** Reloads the page once; returns false when a reload already happened moments ago. */
export function reloadForNewVersion(): boolean {
  let last = 0
  try {
    last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0)
  } catch {
    // storage blocked: still reload, the guard just won't apply
  }
  if (Date.now() - last < RELOAD_GUARD_MS) return false
  try {
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()))
  } catch {
    // ignore
  }
  window.location.reload()
  return true
}

export function installChunkReloadHandler(): void {
  window.addEventListener('vite:preloadError', (event) => {
    if (reloadForNewVersion()) event.preventDefault()
  })
}
