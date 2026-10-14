/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { readFileSync } from 'node:fs'

// https://vite.dev/config/
export default defineConfig({
  // Optional trusted local certificate for invitation email/browser tests.
  server: process.env.LOCAL_HTTPS_PFX ? {
    https: { pfx: readFileSync(process.env.LOCAL_HTTPS_PFX), passphrase: process.env.LOCAL_HTTPS_PASSWORD },
  } : undefined,
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    // A cold Vite transform on Windows/OneDrive can block the event loop while
    // lazy admin/chart chunks compile. Keep behavioral query timeouts unchanged,
    // but do not terminate the whole test while that transform is in flight.
    testTimeout: 30_000,
    maxWorkers: 3,
  },
})
