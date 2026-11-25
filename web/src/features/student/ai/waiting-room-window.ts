/** The backend opens Q&A from this long before the scheduled start (StudentQuestionWindow.WaitingRoomLead). */
export const WAITING_ROOM_AI_LEAD_MS = 15 * 60_000

/** When the waiting room may ask, or null for a start time that cannot be read. */
export function waitingRoomAiOpensAt(scheduledStartAt: string): number | null {
  const start = Date.parse(scheduledStartAt)
  return Number.isFinite(start) ? start - WAITING_ROOM_AI_LEAD_MS : null
}
