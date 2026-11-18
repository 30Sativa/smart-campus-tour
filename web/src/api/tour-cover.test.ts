import { afterEach, describe, expect, it, vi } from 'vitest'
import { tourCoverUrl } from './tour-cover'

afterEach(() => { vi.unstubAllEnvs() })

describe('tourCoverUrl', () => {
  it("builds the Tour's Cloudinary image URL from its id", () => {
    vi.stubEnv('VITE_CLOUDINARY_CLOUD_NAME', 'demo-cloud')
    expect(tourCoverUrl('E7F145D4-3E04-4540-985A-29D8222D75AF', { width: 480, height: 270 })).toBe(
      'https://res.cloudinary.com/demo-cloud/image/upload/c_fill,g_auto,w_480,h_270,f_auto,q_auto/smartcampus/tours/cover/e7f145d43e044540985a29d8222d75af')
  })

  it('is null without a cloud name or for an id that is not a GUID', () => {
    vi.stubEnv('VITE_CLOUDINARY_CLOUD_NAME', '')
    expect(tourCoverUrl('e7f145d4-3e04-4540-985a-29d8222d75af')).toBeNull()
    vi.stubEnv('VITE_CLOUDINARY_CLOUD_NAME', 'demo-cloud')
    expect(tourCoverUrl('tour-1')).toBeNull()
  })
})
