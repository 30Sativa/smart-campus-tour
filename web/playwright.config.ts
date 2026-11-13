import { defineConfig, devices } from '@playwright/test'
import { E2E_API_ORIGIN, E2E_PORT as PORT } from './e2e/support/constants'

/**
 * Screenshot smoke run (UX/UI batch 13/11/2026, WS-K).
 *
 * The app is built and served by `vite preview` on a fixed port, with the API
 * base URL pointed at a host that does not exist. Every request to that host is
 * answered by `page.route` from `e2e/fixtures`, so no run ever reaches a real
 * backend. Screenshots and the HTML report land in `e2e-results/` (ignored by Git).
 */

export default defineConfig({
  testDir: './e2e',
  // Not *.spec.ts / *.test.ts: Vitest would collect those as unit tests.
  testMatch: '**/*.e2e.ts',
  outputDir: './e2e-results/test-output',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: process.env.CI ? 2 : 3,
  timeout: 120_000,
  expect: { timeout: 10_000 },
  reporter: [
    ['list'],
    ['html', { outputFolder: './e2e-results/report', open: 'never' }],
    ['json', { outputFile: './e2e-results/results.json' }],
  ],
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: 'vi-VN',
    timezoneId: 'Asia/Ho_Chi_Minh',
    colorScheme: 'light',
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npx vite build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    env: { VITE_API_BASE_URL: E2E_API_ORIGIN, VITE_QUEST_WHEP_URL: '', VITE_QUEST_STATUS_URL: '', VITE_QUEST_ICE_SERVERS: '' },
  },
})
