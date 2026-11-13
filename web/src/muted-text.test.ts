import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

// Read from disk: Vitest runs with `css: false`, which empties CSS imports, `?raw` included.
const css = readFileSync('src/index.css', 'utf8')

/** WCAG 2 contrast ratio of two `#rrggbb` colours. */
function contrastRatio(foreground: string, background: string): number {
  const luminance = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((start) => {
      const channel = parseInt(hex.slice(start, start + 2), 16) / 255
      return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a)
  return (lighter + 0.05) / (darker + 0.05)
}

function token(block: RegExp, name: string): string {
  const body = block.exec(css)?.[1] ?? ''
  const value = new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`).exec(body)?.[1]
  if (!value) throw new Error(`${name} not found`)
  return value.toLowerCase()
}

const light = token(/:root\s*\{([^}]*)\}/, '--text-muted')
const dark = token(/html\.dark\s*\{([^}]*)\}/, '--text-muted')

describe('muted text colour', () => {
  it('checks the ratio the way WCAG does', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5)
    expect(contrastRatio('#94a3b8', '#ffffff')).toBeLessThan(4.5)
  })

  // White, then every light grey ground the consoles put text on.
  it.each(['#ffffff', '#f8fafc', '#f6f7f9', '#f4f7fb', '#f1f5f9', '#eef1f4', '#eef2f7'])('reads at 4.5:1 or better on %s', (ground) => {
    expect(contrastRatio(light, ground)).toBeGreaterThanOrEqual(4.5)
  })

  it.each(['#071014', '#0f172a', '#1e293b'])('reads at 4.5:1 or better on the dark ground %s', (ground) => {
    expect(contrastRatio(dark, ground)).toBeGreaterThanOrEqual(4.5)
  })

  it('is exposed as the text-muted class', () => {
    expect(css).toMatch(/@utility text-muted\s*\{\s*color:\s*var\(--text-muted\);/)
  })
})
