import { useState } from 'react'

const READ_KEY = 'staff-notices-read:'
/** More than the bell ever lists, so an id only drops out once its notice has. */
const READ_CAP = 200

function loadRead(owner: string): string[] {
  if (!owner) return []
  try {
    const raw = localStorage.getItem(READ_KEY + owner)
    const list: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(list) ? list.filter((value): value is string => typeof value === 'string') : []
  } catch {
    return []
  }
}

function saveRead(owner: string, ids: string[]) {
  if (!owner) return
  try { localStorage.setItem(READ_KEY + owner, JSON.stringify(ids.slice(-READ_CAP))) } catch { /* private mode: reads last for this visit */ }
}

/**
 * Which notices this account has read, on this browser (the same choice as the
 * Representative bell): there is no server read state, and a notice is news, not
 * a task, so losing it on another device costs nothing.
 */
export function useReadNotices(owner: string) {
  const [read, setRead] = useState(() => ({ owner, ids: loadRead(owner) }))
  if (read.owner !== owner) setRead({ owner, ids: loadRead(owner) })
  const markRead = (ids: string[]) => {
    const fresh = ids.filter(id => !read.ids.includes(id))
    if (fresh.length === 0) return
    const next = [...read.ids, ...fresh]
    saveRead(owner, next)
    setRead({ owner, ids: next })
  }
  return { readIds: new Set(read.ids), markRead }
}
