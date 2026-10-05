import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules() })

describe('occupancy map deployment URL', () => {
  it.each(['/', '/campus/'])('uses Vite base %s for the shared display and sampling URL', async (base) => {
    vi.stubEnv('BASE_URL', base)
    vi.resetModules()
    const { DEFAULT_POI_MAP } = await import('./catalog')
    expect(DEFAULT_POI_MAP.imageUrl).toBe(`${base}maps/map2-v1/occupancy-72d43c1d265c59c8.png`)
    expect(DEFAULT_POI_MAP.origin[2]).toBe(0)
  })
})
