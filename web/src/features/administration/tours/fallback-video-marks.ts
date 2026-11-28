/** ADR-0075 stage 2: the second of the fallback video at which the recording reaches one stop of the Tour's route. */
export type FallbackVideoMark = { revisionStopId: string; startSeconds: number }

/** A stop that can take a mark: `id` is its `RouteRevisionStops.Id`. */
export type MarkStop = { id: string; order: number; name: string }

/**
 * What Staff typed for each stop (stop id → "phút:giây"), with the length of the video when the form has the file
 * (read from the local preview); null for a video uploaded earlier, whose length the browser cannot read.
 */
export type MarkDraft = { texts: Record<string, string>; duration: number | null }

/** The server's limit: a recording longer than a day is not a Tour. */
export const MAX_MARK_SECONDS = 86_400

export const emptyMarkDraft: MarkDraft = { texts: {}, duration: null }

/** 95 → "1:35"; 3_725 → "1:02:05". */
export function formatMark(seconds: number) {
  const whole = Math.max(0, Math.floor(seconds))
  const h = Math.floor(whole / 3600)
  const m = Math.floor((whole % 3600) / 60)
  const s = String(whole % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`
}

/** "1:35" or "95" → 95; blank → null (no mark); anything else → undefined. */
export function parseMark(text: string): number | null | undefined {
  const value = text.trim()
  if (!value) return null
  if (!/^\d+(:\d{1,2}){0,2}$/.test(value)) return undefined
  const parts = value.split(':').map(Number)
  if (parts.slice(1).some(part => part > 59)) return undefined
  return parts.reduce((total, part) => total * 60 + part, 0)
}

export function draftOf(marks: FallbackVideoMark[] | null | undefined): MarkDraft {
  return { texts: Object.fromEntries((marks ?? []).map(mark => [mark.revisionStopId, formatMark(mark.startSeconds)])), duration: null }
}

/** The marks to save for these stops, in recording order, or why they cannot be saved yet. */
export function marksOf(draft: MarkDraft, stops: MarkStop[]): { marks: FallbackVideoMark[]; problem: string | null } {
  const limit = draft.duration != null && Number.isFinite(draft.duration) ? Math.floor(draft.duration) : MAX_MARK_SECONDS
  const marks: FallbackVideoMark[] = []
  let problem: string | null = null
  for (const stop of stops) {
    const seconds = parseMark(draft.texts[stop.id] ?? '')
    if (seconds === null) continue
    if (seconds === undefined) problem ??= 'sửa mốc thời gian theo dạng phút:giây'
    else if (seconds > limit) problem ??= 'đặt mốc thời gian trong độ dài video'
    else marks.push({ revisionStopId: stop.id, startSeconds: seconds })
  }
  return { marks: marks.sort((a, b) => a.startSeconds - b.startSeconds), problem }
}
