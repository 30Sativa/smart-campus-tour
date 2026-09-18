/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Base URL of the backend API, e.g. http://localhost:5000. Never hard-code
   * this. Read only through `src/api/client.ts`, which is what the SignalR hub
   * factory resolves its URL against.
   */
  readonly VITE_API_BASE_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
