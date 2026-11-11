import { resolveWhepUrl } from './whep'
import { resolveDeviceUrl } from './quest-device'

/**
 * Dev only: the WebRTC (WHEP) endpoint of MediaMTX on the robot NUC in the
 * same LAN, e.g. `http://10.80.192.207:8889/quest/whep`. A production build
 * never reads `VITE_QUEST_WHEP_URL` (the branch is removed at build time), so
 * the public relay's address is not in the bundle: pages get it, with a
 * token, from the API (ADR-0055). Read the env vars here only.
 */
export const QUEST_DEV_WHEP_URL: string | null = import.meta.env.DEV
  ? resolveWhepUrl(import.meta.env.VITE_QUEST_WHEP_URL)
  : null

if (import.meta.env.DEV && import.meta.env.VITE_QUEST_WHEP_URL?.trim() && !QUEST_DEV_WHEP_URL) {
  console.warn('[quest-stream] VITE_QUEST_WHEP_URL is not a WHEP URL like http://<NUC_IP>:8889/quest/whep')
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

/**
 * Headset status (adb connection, battery, charging) served by quest-stream on
 * the miniPC: `http://<NUC_IP>:8080/device` (`http://<NUC_IP>:8080` works too).
 * Unset = the Staff dashboard says the headset monitor is not configured.
 */
export const QUEST_STATUS_URL: string | null = resolveDeviceUrl(import.meta.env.VITE_QUEST_STATUS_URL)

if (import.meta.env.VITE_QUEST_STATUS_URL?.trim() && !QUEST_STATUS_URL) {
  console.warn('[quest-stream] VITE_QUEST_STATUS_URL is not a URL like http://<NUC_IP>:8080/device')
}
