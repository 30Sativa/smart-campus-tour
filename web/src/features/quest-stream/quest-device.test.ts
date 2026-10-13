import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchQuestDevice, questDeviceView, resolveDeviceUrl, type QuestDevice } from './quest-device'

function device(overrides: Partial<QuestDevice> = {}): QuestDevice {
  return {
    connection: 'connected',
    reason: '',
    serial: '2G0YC1ZF8B0A2K',
    model: 'Quest 3',
    battery: { level: 76, charging: false, plugged: null, status: 'discharging' },
    batteryError: null,
    checkedAt: 1000,
    stream: 'live',
    streamState: 'live',
    streamReason: '',
    pollSeconds: 5,
    now: 1003,
    ...overrides,
  }
}

describe('resolveDeviceUrl', () => {
  it('points the quest-stream address at /device', () => {
    expect(resolveDeviceUrl('http://10.0.0.5:8080')).toBe('http://10.0.0.5:8080/device')
    expect(resolveDeviceUrl(' http://10.0.0.5:8080/ ')).toBe('http://10.0.0.5:8080/device')
    expect(resolveDeviceUrl('http://10.0.0.5:8080/device')).toBe('http://10.0.0.5:8080/device')
  })

  it('rejects empty and non-http values', () => {
    for (const value of [undefined, null, '', '  ', 'nuc:8080', 'rtsp://10.0.0.5:8554/quest']) {
      expect(resolveDeviceUrl(value)).toBeNull()
    }
  })
})

describe('questDeviceView', () => {
  it('raises no alert for a connected, charged, live headset', () => {
    const view = questDeviceView(device())
    expect(view.alerts).toEqual([])
    expect(view.ageSeconds).toBe(3)
    expect(view.overall.tone).toBe('ok')
  })

  it('warns below 20% battery', () => {
    const view = questDeviceView(device({ battery: { level: 12, charging: false, plugged: null, status: 'discharging' } }))
    expect(view.alerts.map((alert) => alert.title)).toEqual(['Pin kính còn 12%.'])
    expect(view.overall.tone).toBe('danger')
    expect(questDeviceView(device({ battery: { level: 20, charging: false, plugged: null, status: 'discharging' } })).alerts).toEqual([])
  })

  it('keeps the headset connection apart from the livestream', () => {
    const lost = questDeviceView(device({ stream: 'lost' }))
    expect(lost.alerts.map((alert) => alert.title)).toEqual(['Livestream bị gián đoạn.'])
    // A missing headset is reported once, as a connection problem, not also as a stream alert.
    const gone = questDeviceView(device({ connection: 'not_found', battery: null, stream: 'lost' }))
    expect(gone.alerts.map((alert) => alert.title)).toEqual(['Mất kết nối với kính.'])
  })

  it('asks for ADB permission as a warning, not a failure', () => {
    const view = questDeviceView(device({ connection: 'unauthorized', battery: null, stream: 'connecting' }))
    expect(view.alerts).toHaveLength(1)
    expect(view.overall.tone).toBe('warn')
  })

  it('flags a stale reading by the miniPC clock', () => {
    const view = questDeviceView(device({ checkedAt: 1000, now: 1030 }))
    expect(view.stale).toBe(true)
    expect(view.alerts.at(-1)?.title).toBe('Dữ liệu kính đã cũ.')
  })

  it('says it is still checking before the first read', () => {
    const view = questDeviceView(device({ connection: 'unknown', checkedAt: null, battery: null, stream: 'connecting' }))
    expect(view.ageSeconds).toBeNull()
    expect(view.overall.label).toBe('Đang kiểm tra')
  })
})

describe('fetchQuestDevice', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('returns a well-formed body', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(device()), { status: 200 })))
    await expect(fetchQuestDevice('http://nuc:8080/device')).resolves.toMatchObject({ connection: 'connected', stream: 'live' })
  })

  it('rejects HTTP errors and malformed bodies instead of inventing values', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('down', { status: 503 })))
    await expect(fetchQuestDevice('http://nuc:8080/device')).rejects.toThrow('HTTP 503')
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ connection: 'maybe' }), { status: 200 })))
    await expect(fetchQuestDevice('http://nuc:8080/device')).rejects.toThrow('không đúng định dạng')
  })
})
