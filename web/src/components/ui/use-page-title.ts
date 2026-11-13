import { useEffect } from 'react'
import { create } from 'zustand'

/**
 * The page being viewed names the browser tab and the console header.
 *
 * A page calls `usePageTitle` (PageHeader does it for every page that has one).
 * The tab reads "<title> · CampusTour", and a shell reads `useCurrentPageTitle()`
 * for its breadcrumb and header line, so they show "Tạo Tour" rather than the
 * menu item the page sits under. The shell keeps its own fallback for the moment
 * before a lazy page has mounted.
 */

export const APP_NAME = 'CampusTour'

export const documentTitleFor = (title: string) => `${title} · ${APP_NAME}`

type PageTitleState = {
  /** Mounted titles in mount order; the last one is the page in front. */
  entries: Array<{ key: symbol; title: string }>
}

const usePageTitleStore = create<PageTitleState>(() => ({ entries: [] }))

/** The title of the page in front, or null before any page has set one. */
export function useCurrentPageTitle(): string | null {
  return usePageTitleStore((state) => state.entries.at(-1)?.title ?? null)
}

export function usePageTitle(title: string) {
  useEffect(() => {
    const trimmed = title.trim()
    if (!trimmed) return
    const key = Symbol(trimmed)
    const previous = document.title
    usePageTitleStore.setState((state) => ({ entries: [...state.entries, { key, title: trimmed }] }))
    document.title = documentTitleFor(trimmed)
    return () => {
      usePageTitleStore.setState((state) => ({ entries: state.entries.filter((entry) => entry.key !== key) }))
      document.title = previous
    }
  }, [title])
}
