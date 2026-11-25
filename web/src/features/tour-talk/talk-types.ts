import { ApiError } from '../../api/client'

/**
 * Tour talk (ADR-0070): the Operator speaks to every Viewer as text or a short voice clip; a Viewer answers in text,
 * which only Staff read. The server keeps it in memory only.
 */
export type TalkMessage = {
  id: string
  seq: number
  from: 'STAFF' | 'VIEWER'
  text: string | null
  hasAudio: boolean
  /** False once the server dropped the clip to stay within its memory bound; the message stays. */
  audioAvailable: boolean
  audioDurationMs: number | null
  staffName: string | null
  /** Staff readers only: who answered. A Viewer never reads another row's identity. */
  viewerName: string | null
  viewerClass: string | null
  viewerRowType: string | null
  /** Viewer readers only: this browser's row wrote it. */
  mine: boolean
  sentAt: string
}

export type TalkFeed = { epoch: string; lastSeq: number; open: boolean; canSend: boolean; messages: TalkMessage[] }

export const TALK_MAX_TEXT = 500
export const TALK_MAX_AUDIO_MS = 30_000
export const TALK_MAX_AUDIO_BYTES = 1_000_000
/** The server reads the whole kept conversation; a short poll is enough for a spoken exchange. */
export const TALK_POLL_MS = 2_000

/** Only a well-formed feed counts; anything else reads as "nothing yet". */
export function readTalkFeed(value: unknown): TalkFeed | null {
  if (!value || typeof value !== 'object') return null
  const feed = value as Partial<TalkFeed>
  if (typeof feed.epoch !== 'string' || typeof feed.open !== 'boolean' || !Array.isArray(feed.messages)) return null
  const messages = feed.messages.filter((message): message is TalkMessage => Boolean(message) && typeof message === 'object'
    && typeof (message as TalkMessage).id === 'string' && typeof (message as TalkMessage).seq === 'number'
    && ((message as TalkMessage).from === 'STAFF' || (message as TalkMessage).from === 'VIEWER'))
  return { epoch: feed.epoch, lastSeq: typeof feed.lastSeq === 'number' ? feed.lastSeq : 0, open: feed.open,
    canSend: feed.canSend === true, messages: [...messages].sort((a, b) => a.seq - b.seq) }
}

function errorCode(error: ApiError): string | undefined {
  try {
    const parsed = JSON.parse(error.body) as { errors?: { code?: unknown } }
    return typeof parsed.errors?.code === 'string' ? parsed.errors.code : undefined
  } catch { return undefined }
}

/** What the sender reads when a message was not sent. */
export function talkErrorText(error: unknown): string {
  if (error instanceof ApiError) {
    const code = errorCode(error)
    if (error.status === 409 && code === 'TALK_OPENS_LATER') return 'Kênh trò chuyện mở từ 15 phút trước giờ bắt đầu.'
    if (error.status === 409 && code === 'TALK_CLOSED') return 'Buổi tham quan đã kết thúc nên kênh trò chuyện đã đóng.'
    if (error.status === 429) return 'Bạn gửi hơi nhanh. Đợi một chút rồi nhắn tiếp nhé.'
    if (error.status === 403) return 'Chỉ người vận hành của Tour mới nói chuyện với người xem được.'
    if (error.status === 401) return 'Phiên đã hết hạn. Tải lại trang để vào lại.'
    if (error.status === 413 || error.status === 400) return 'Tin nhắn hoặc đoạn ghi âm chưa hợp lệ (tối đa 500 ký tự, 30 giây).'
  }
  return 'Chưa gửi được. Kiểm tra kết nối rồi thử lại.'
}

/** "0:07" for a clip length. */
export function clipLength(ms: number | null | undefined): string {
  const seconds = Math.max(1, Math.round((ms ?? 0) / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}
