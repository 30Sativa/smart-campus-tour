/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the backend API, e.g. http://localhost:5000. Never hard-code this. */
  readonly VITE_API_BASE_URL: string
  /**
   * Set to "false" to talk to a real backend. Anything else (including unset)
   * runs the labelled mock data in src/mocks/ — see src/mocks/mock-mode.ts.
   */
  readonly VITE_USE_MOCK_API?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
