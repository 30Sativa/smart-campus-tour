import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_POI_MAP } from './catalog'
import { loadMapImage } from './load-map-image'

const map = { ...DEFAULT_POI_MAP, width: 2, height: 1 }
class FakeImage {
  static current: FakeImage
  naturalWidth = 2
  naturalHeight = 1
  onload = () => {}
  onerror = () => {}
  src = ''
  constructor() { FakeImage.current = this }
}

describe('map raster loading', () => {
  beforeEach(() => { vi.stubGlobal('Image', FakeImage) })
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

  it('rejects mismatched image dimensions', async () => {
    const loaded = loadMapImage(map)
    expect(FakeImage.current.src).toBe(map.imageUrl)
    FakeImage.current.naturalWidth = 3
    FakeImage.current.onload()
    await expect(loaded).rejects.toThrow(/dimensions/)
  })

  it('reads cells at source resolution and keeps an unavailable sample explicit', async () => {
    const pixels = new Uint8ClampedArray(8)
    const drawImage = vi.fn()
    const getImageData = vi.fn(() => ({ data: pixels }))
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage, getImageData } as unknown as CanvasRenderingContext2D)
    const loaded = loadMapImage(map)
    FakeImage.current.onload()
    expect(await loaded).toEqual({ pixels })
    expect(drawImage).toHaveBeenCalledWith(FakeImage.current, 0, 0)
    expect(getImageData).toHaveBeenCalledWith(0, 0, 2, 1)
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    const unavailable = loadMapImage(map)
    FakeImage.current.onload()
    expect(await unavailable).toEqual({ pixels: null })
  })

  it('rejects an image request failure instead of fabricating raster data', async () => {
    const loaded = loadMapImage(map)
    FakeImage.current.onerror()
    await expect(loaded).rejects.toThrow(/could not be loaded/)
  })
})
