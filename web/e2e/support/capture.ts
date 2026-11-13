import { expect, test, type Page } from '@playwright/test'

export const WIDTHS = [375, 800, 1366] as const
const HEIGHT = 900

/** Words that must never reach a user (owner brief, section 1). Matched case-insensitively. */
const BANNED_WORDS = ['telemetry', 'Fleet Sync', 'miniPC', 'M2.3', 'snapshot', 'route guard', 'QUEST_CONTROL_URL']
/** Technical pages may use technical terms, but never env var names. */
const TECHNICAL_BANNED_WORDS = ['QUEST_CONTROL_URL', 'route guard']
const BANNED_DASHES = ['\u2014', '\u2013']

export type CaptureOptions = {
  /** Expected `document.title` without the " · CampusTour" suffix. */
  title: string
  technical?: boolean
  /** Waits for the page's own content after every resize (e.g. a heading). */
  ready?: (page: Page) => Promise<void>
  /** Scroll to the bottom and back first, so scroll-triggered sections have revealed themselves. */
  scrollThrough?: boolean
}

/**
 * Screenshot one page at every width and run the shared checks. The checks are
 * soft so every width is still captured; failures are listed in the report.
 */
export async function capturePage(page: Page, area: string, name: string, options: CaptureOptions) {
  for (const width of WIDTHS) {
    await test.step(`${area}-${name} @${width}px`, async () => {
      await page.setViewportSize({ width, height: HEIGHT })
      await settle(page)
      if (options.ready) await options.ready(page)
      if (options.scrollThrough) await scrollThrough(page)
      await page.screenshot({ path: `e2e-results/screenshots/${area}-${name}-${width}.png`, fullPage: true })

      const where = `${area}-${name} @${width}px`
      const overflow = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }))
      expect.soft(overflow.scroll, `${where}: horizontal overflow (scrollWidth ${overflow.scroll} > innerWidth ${overflow.inner})`)
        .toBeLessThanOrEqual(overflow.inner)

      const title = await page.title()
      expect.soft(title, `${where}: document.title`).toBe(`${options.title} · CampusTour`)

      const text = await page.evaluate(() => document.body.innerText)
      const words = options.technical ? TECHNICAL_BANNED_WORDS : BANNED_WORDS
      const lower = text.toLowerCase()
      const found = [
        ...words.filter((word) => lower.includes(word.toLowerCase())),
        ...BANNED_DASHES.filter((dash) => text.includes(dash)).map((dash) => (dash === '\u2014' ? 'em dash' : 'en dash')),
      ]
      expect.soft(found, `${where}: banned words on the page${found.length ? `: ${found.map((word) => `"${word}" in "${context(text, word)}"`).join('; ')}` : ''}`)
        .toEqual([])
    })
  }
}

function context(text: string, word: string): string {
  const needle = word === 'em dash' ? '\u2014' : word === 'en dash' ? '\u2013' : word
  const index = text.toLowerCase().indexOf(needle.toLowerCase())
  return index < 0 ? '' : text.slice(Math.max(0, index - 40), index + needle.length + 40).replace(/\s+/g, ' ').trim()
}

/** Let a resize re-layout and lazy chunks/images finish before the screenshot. */
async function settle(page: Page) {
  await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {})
  await page.evaluate(() => document.fonts?.ready)
  await page.waitForTimeout(400)
}

async function scrollThrough(page: Page) {
  const height = await page.evaluate(() => document.documentElement.scrollHeight)
  for (let y = 0; y < height; y += 600) {
    await page.mouse.wheel(0, 600)
    await page.waitForTimeout(120)
  }
  await page.waitForTimeout(800)
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(400)
}
