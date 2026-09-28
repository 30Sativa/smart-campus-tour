/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Base URL of the backend API, e.g. http://localhost:5000. Never hard-code
   * this. Read only through `src/api/client.ts`, which is what the SignalR hub
   * factory resolves its URL against.
   */
  readonly VITE_API_BASE_URL: string
  /**
   * WebRTC (WHEP) endpoint of the Quest 3 live stream: MediaMTX on the robot
   * NUC, e.g. http://10.80.192.207:8889/quest/whep. Optional: unset keeps the
   * pages on their current video source. Read only through
   * `features/quest-stream/quest-stream-config.ts`.
   */
  readonly VITE_QUEST_WHEP_URL?: string
  /** Optional STUN URLs for the Quest stream, comma separated. */
  readonly VITE_QUEST_ICE_SERVERS?: string
  /** @deprecated The old HLS address; only read to warn that it is ignored. */
  readonly VITE_QUEST_STREAM_URL?: string
  /**
   * `on` connects the operations twin and the student 2D map to the backend's
   * real robot positions (`/hubs/fleet`). Anything else keeps the mocks. Read
   * only through `api/contracts/fleet-realtime.ts`.
   */
  readonly VITE_FLEET_HUB?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
