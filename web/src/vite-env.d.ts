/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Base URL of the backend API, e.g. http://localhost:5000. Never hard-code
   * this. Read only through `src/api/client.ts`, which is what the SignalR hub
   * factory resolves its URL against.
   */
  readonly VITE_API_BASE_URL: string
  /**
   * HLS playlist of the Quest 3 live stream served by robot/quest-stream on
   * the robot NUC, e.g. http://10.80.192.207:8080/hls/quest.m3u8. Optional:
   * unset keeps the pages on their current video source. Read only through
   * `features/quest-stream/quest-stream-config.ts`.
   */
  readonly VITE_QUEST_STREAM_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
