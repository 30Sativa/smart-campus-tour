import { resolveWhepUrl } from './whep'

/**
 * WebRTC (WHEP) endpoint of the Quest 3 live stream: MediaMTX on the robot
 * NUC, fed by robot/quest-stream, e.g. `http://10.80.192.207:8889/quest/whep`
 * (`http://10.80.192.207:8889/quest` works too).
 *
 * Unset = no Quest stream: the pages keep their current video source. Read the
 * env vars here only; components import these constants.
 */
export const QUEST_WHEP_URL: string | null = resolveWhepUrl(import.meta.env.VITE_QUEST_WHEP_URL)

if (import.meta.env.VITE_QUEST_WHEP_URL?.trim() && !QUEST_WHEP_URL) {
  console.warn('[quest-stream] VITE_QUEST_WHEP_URL is not a WHEP URL like http://<NUC_IP>:8889/quest/whep')
}
if (import.meta.env.VITE_QUEST_STREAM_URL?.trim() && !import.meta.env.VITE_QUEST_WHEP_URL) {
  console.warn('[quest-stream] VITE_QUEST_STREAM_URL (HLS) is no longer used: set VITE_QUEST_WHEP_URL=http://<NUC_IP>:8889/quest/whep')
}

/**
 * STUN servers for viewers outside the robot's LAN, comma separated, e.g.
 * `stun:stun.l.google.com:19302`. Empty on a LAN (the usual case).
 */
export const QUEST_ICE_SERVERS: RTCIceServer[] = (import.meta.env.VITE_QUEST_ICE_SERVERS ?? '')
  .split(',')
  .map((url) => url.trim())
  .filter(Boolean)
  .map((urls) => ({ urls }))
