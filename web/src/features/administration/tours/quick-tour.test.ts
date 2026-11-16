import { describe, expect, it } from 'vitest'
import { routes } from '../../../app/router'
import { QUICK_TOUR_RULES, representativeTourPath } from './quick-tour'

/** Every sentence the rules module can produce, with and without a configured wait. */
function allSentences(): string[] {
  const out: string[] = []
  const walk = (value: unknown) => {
    if (typeof value === 'string') out.push(value)
    else if (typeof value === 'function') { walk(value(30)); walk(value(null)) }
    else if (Array.isArray(value)) value.forEach(walk)
    else if (value && typeof value === 'object') Object.values(value).forEach(walk)
  }
  walk(QUICK_TOUR_RULES)
  return out
}

describe('quick Tour rules (ADR-0053, ADR-0054, ADR-0057)', () => {
  it('no longer says Start waits for everyone (ADR-0057: the waiting room only warns)', () => {
    for (const sentence of allSentences()) {
      expect(sentence).not.toMatch(/đủ người/i)
      expect(sentence).not.toMatch(/và mọi điểm xem đã vào phòng chờ/i)
      expect(sentence).not.toMatch(/chốt danh sách và đủ/i)
    }
    // The replacement is said: an early Start only warns about missing viewers.
    expect(QUICK_TOUR_RULES.start.note).toMatch(/chỉ cảnh báo/)
  })

  it('keeps the rules that still hold: hold from creation, no accepted row needed, the deadline and automatic cancel', () => {
    expect(QUICK_TOUR_RULES.hold.value).toMatch(/Từ lúc bấm Tạo Tour/)
    // TourStartPreflight: IsShortNotice || HasAcceptedRows, so a quick Tour needs no accepted registration.
    expect(QUICK_TOUR_RULES.start.note).toMatch(/^Không cần đăng ký đã duyệt\./)
    expect(QUICK_TOUR_RULES.start.note).not.toMatch(/ít nhất một đăng ký/)
    expect(QUICK_TOUR_RULES.deadline(30).value).toBe('30 phút sau khi tạo')
    // D4: Start stays open 15 minutes after the deadline, and the system cancel waits for the end of the robot hold.
    expect(QUICK_TOUR_RULES.deadline(30).note).toBe('Đã chốt thì còn bắt đầu muộn tối đa 15 phút sau hạn. Chưa bắt đầu thì hệ thống tự hủy và trả robot khi hết khung giữ robot.')
    expect(QUICK_TOUR_RULES.deadline(30).note).not.toMatch(/trước hạn thì/)
    expect(QUICK_TOUR_RULES.facts(45)).toContain('Chưa bắt đầu sau 45 phút thì tự hủy')
  })

  it('uses no dash and no English action name', () => {
    for (const sentence of allSentences()) {
      expect(sentence).not.toMatch(/[—–]/)
      expect(sentence).not.toMatch(/\bStart\b/)
    }
  })

  it('links the Representative to a route the router has', () => {
    expect(representativeTourPath('tour-1')).toBe('/dai-dien/buoi/tour-1')
    const area = routes.find(route => route.path === '/dai-dien') as { children?: Array<{ path?: string }> } | undefined
    expect(area?.children?.some(child => child.path === 'buoi/:tourId')).toBe(true)
  })
})
