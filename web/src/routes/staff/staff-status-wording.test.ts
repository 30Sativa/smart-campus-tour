import { describe, expect, it } from 'vitest'

/**
 * web/AGENTS.md: no backend enum reaches a screen. Scans the sentences written in Staff screens
 * (string and JSX text holding Vietnamese), so a raw status inside a sentence fails here.
 */
const SOURCES = import.meta.glob(['./**/*.{ts,tsx}', '../../features/staff/**/*.{ts,tsx}',
  '../../features/administration/{tours,registrations,routes,pois}/**/*.{ts,tsx}', '!**/*.test.*'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>

const RAW_STATUS = /\b(SCHEDULED|READY|RUNNING|PENDING|ACCEPTED|PASS|FAIL)\b|snapshot/
const VIETNAMESE = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i
const TEXT = /'([^']*)'|"([^"]*)"|`([^`]*)`|>([^<>{}]+)</g

function offending(source: string): string[] {
  return source.split('\n').filter(line => !/^\s*(\/\/|\*|\/\*)/.test(line)).flatMap(line =>
    [...line.matchAll(TEXT)].map(match => match.slice(1).find(Boolean) ?? '').filter(text => VIETNAMESE.test(text) && RAW_STATUS.test(text)))
}

describe('Staff wording', () => {
  it('scans the Staff screens', () => expect(Object.keys(SOURCES).length).toBeGreaterThan(40))

  it('catches a raw status in a sentence', () => {
    expect(offending('note="Tour SCHEDULED cần chốt (READY)"')).toHaveLength(1)
    expect(offending("tour.state === 'READY' ? 'Đã chốt' : 'Chưa chốt'")).toHaveLength(0)
  })

  it('has no raw status in any sentence', () => {
    expect(Object.entries(SOURCES).flatMap(([file, source]) => offending(source).map(text => `${file}: ${text}`))).toEqual([])
  })
})
