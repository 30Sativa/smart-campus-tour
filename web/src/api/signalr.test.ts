import { describe, expect, it } from 'vitest'
import { hubUrl } from './signalr'

describe('hubUrl', () => {
  it('is absolute even when VITE_API_BASE_URL is empty, so SignalR can resolve it outside a browser', () => {
    const url = new URL(hubUrl('/hubs/operations'))
    expect(url.protocol).toMatch(/^https?:$/)
    expect(url.pathname).toBe('/hubs/operations')
  })
})
