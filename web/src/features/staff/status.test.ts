import { describe, expect, it } from 'vitest'
import { severityRank, statusInfo, statusLabel } from './status'

describe('status vocabulary', () => {
  it('never shows a backend enum to a person', () => {
    expect(statusLabel('InProgress')).toBe('Đang diễn ra')
    expect(statusLabel('Scheduled')).toBe('Đã lên lịch')
    expect(statusLabel('Completed')).toBe('Hoàn thành')
    expect(statusLabel('Paused')).toBe('Tạm dừng')
    expect(statusLabel('Live')).toBe('Trực tuyến')
    expect(statusLabel('Stale')).toBe('Dữ liệu chậm')
    expect(statusLabel('Disconnected')).toBe('Mất kết nối')
    expect(statusLabel('Navigating')).toBe('Đang di chuyển')
    expect(statusLabel('Idle')).toBe('Đang chờ')
    expect(statusLabel('Critical')).toBe('Nghiêm trọng')
    expect(statusLabel('Warning')).toBe('Cảnh báo')
    expect(statusLabel('Information')).toBe('Thông tin')
  })

  it('reads the enum whatever case it arrives in', () => {
    expect(statusLabel('inprogress')).toBe('Đang diễn ra')
    expect(statusLabel('  LIVE ')).toBe('Trực tuyến')
  })

  it('does not dress an unhealthy state as a healthy one', () => {
    expect(statusInfo('Live').tone).toBe('ok')
    expect(statusInfo('Stale').tone).toBe('warn')
    expect(statusInfo('Disconnected').tone).toBe('danger')
    expect(statusInfo('Critical').tone).toBe('danger')
    expect(statusInfo('Idle').tone).toBe('muted')
  })

  it('shows an unknown status as it came, toned neutral', () => {
    expect(statusLabel('Teleporting')).toBe('Teleporting')
    expect(statusInfo('Teleporting').tone).toBe('muted')
    expect(statusLabel(null)).toBe('Chưa xác định')
  })

  it('puts the worst alert first', () => {
    const sorted = ['Information', 'Critical', 'Warning'].sort((a, b) => severityRank(a) - severityRank(b))
    expect(sorted).toEqual(['Critical', 'Warning', 'Information'])
  })
})
