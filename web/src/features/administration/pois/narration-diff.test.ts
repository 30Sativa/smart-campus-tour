import { describe, expect, it } from 'vitest'
import { narrationDiff } from './narration-diff'

describe('narrationDiff', () => {
  it('marks the words added and removed between the version in use and the draft', () => {
    expect(narrationDiff('Đây là thư viện cũ.', 'Đây là thư viện mới của trường.')).toEqual([
      { kind: 'same', text: 'Đây là thư viện ' },
      { kind: 'removed', text: 'cũ.' },
      { kind: 'added', text: 'mới của trường.' },
    ])
  })

  it('shows the whole draft as added when nothing is in use yet, and nothing changed as one part', () => {
    expect(narrationDiff('', 'Lời chào.')).toEqual([{ kind: 'added', text: 'Lời chào.' }])
    expect(narrationDiff('Giữ nguyên.', 'Giữ nguyên.')).toEqual([{ kind: 'same', text: 'Giữ nguyên.' }])
  })

  it('joins the parts back into the draft text', () => {
    const after = 'Một hai\nba bốn năm'
    const text = narrationDiff('Một ba sáu', after).filter(part => part.kind !== 'removed').map(part => part.text).join('')
    expect(text).toBe(after)
  })
})
