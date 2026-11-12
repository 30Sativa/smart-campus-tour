import { describe, expect, it } from 'vitest'
import { CALLOUTS, layoutCallouts } from './callouts'
import { PART_GROUPS } from './parts'

const frame = { width: 800, top: 60, bottom: 540, height: 26, gap: 6 }

describe('callouts beside the 3D robot', () => {
  it('points only at catalogued parts, each once', () => {
    const groups = CALLOUTS.map(callout => callout.group)
    expect(new Set(groups).size).toBe(groups.length)
    for (const group of groups) expect(PART_GROUPS.some(part => part.id === group)).toBe(true)
    expect(CALLOUTS.filter(callout => callout.key).length).toBeGreaterThanOrEqual(4)
  })

  it('puts each label on the side of its part, top to bottom, without overlaps', () => {
    const points = [{ id: 0, x: 300, y: 200 }, { id: 1, x: 320, y: 205 }, { id: 2, x: 500, y: 300 }, { id: 3, x: 310, y: 190 }]
    const placed = layoutCallouts(points, frame)
    expect(placed.map(place => place.side)).toEqual(['left', 'left', 'right', 'left'])
    const left = placed.filter(place => place.side === 'left').sort((a, b) => a.y - b.y)
    expect(left.map(place => place.id)).toEqual([3, 0, 1])
    for (let i = 1; i < left.length; i += 1) expect(left[i].y - left[i - 1].y).toBeGreaterThanOrEqual(frame.height + frame.gap)
  })

  it('keeps a crowded column inside the stage', () => {
    const points = Array.from({ length: 8 }, (_, id) => ({ id, x: 100, y: 530 }))
    const placed = layoutCallouts(points, frame)
    for (const place of placed) {
      expect(place.y).toBeGreaterThanOrEqual(frame.top - 1e-9)
      expect(place.y).toBeLessThanOrEqual(frame.bottom - frame.height)
    }
  })

  it('does not flip a label across while its part is near the middle, and can be put on one side', () => {
    const point = { id: 4, x: 420, y: 300 }
    expect(layoutCallouts([point], frame)[0].side).toBe('right')
    expect(layoutCallouts([point], frame, new Map([[4, 'left' as const]]))[0].side).toBe('left')
    expect(layoutCallouts([{ ...point, x: 700 }], frame, new Map([[4, 'left' as const]]))[0].side).toBe('right')
    expect(layoutCallouts([{ ...point, x: 700 }], { ...frame, side: 'left' })[0].side).toBe('left')
    // With a panel over the right half, the middle of the free part decides.
    expect(layoutCallouts([{ ...point, x: 300 }], { ...frame, middle: 200 })[0].side).toBe('right')
  })
})
