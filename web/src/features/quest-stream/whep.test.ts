import { describe, expect, it } from 'vitest'
import { resolveWhepUrl } from './whep'

describe('resolveWhepUrl', () => {
  it('accepts the WHEP endpoint as is', () => {
    expect(resolveWhepUrl('http://10.0.0.5:8889/quest/whep')).toBe('http://10.0.0.5:8889/quest/whep')
  })

  it('turns the MediaMTX page address into its WHEP endpoint', () => {
    expect(resolveWhepUrl(' http://10.0.0.5:8889/quest/ ')).toBe('http://10.0.0.5:8889/quest/whep')
    expect(resolveWhepUrl('https://nuc.local/robot1/quest')).toBe('https://nuc.local/robot1/quest/whep')
  })

  it('rejects empty values, non-http URLs and old HLS playlists', () => {
    for (const value of [undefined, null, '', '   ', 'nuc:8889/quest', 'rtsp://10.0.0.5:8554/quest', 'http://10.0.0.5:8080/hls/quest.m3u8']) {
      expect(resolveWhepUrl(value)).toBeNull()
    }
  })
})
