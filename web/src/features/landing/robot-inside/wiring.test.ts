import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PART_GROUPS } from '../robot-explode/parts'
import { COMPONENTS, PART_TO_INSIDE, WIRES, WIRE_KINDS, component, isInsideId, wiresOf, type InsideComponent } from './wiring'
import type { Point3 } from './iso'

// The firmware's pin map is the source for every STM32 pin the page names.
const pinMap = readFileSync(resolve(process.cwd(), '../robot/firmware/stm32/motor_controller/docs/PIN_MAP.md'), 'utf8')
const usedPins = pinMap.slice(pinMap.indexOf('## 1. Các chân đang dùng'), pinMap.indexOf('## 2. Các chân còn trống'))

/** How far a model point is from a part (0 inside it), metres. */
function distanceTo(item: InsideComponent, [x, y, z]: Point3): number {
  if (item.offRobot) return Math.hypot(x - item.offRobot[0], y - item.offRobot[1], z - item.offRobot[2])
  const toBox = item.boxes.map(({ min, max }) => Math.hypot(
    Math.max(min[0] - x, 0, x - max[0]), Math.max(min[1] - y, 0, y - max[1]), Math.max(min[2] - z, 0, z - max[2])))
  const toCylinder = item.cylinder
    ? [Math.hypot(
        Math.max(0, Math.hypot(x - item.cylinder.centre[0], z - item.cylinder.centre[1]) - item.cylinder.radius),
        Math.max(item.cylinder.from - y, 0, y - item.cylinder.to))]
    : []
  return Math.min(...toBox, ...toCylinder)
}

describe('robot wiring', () => {
  it('numbers the parts 1 to N in order, each once', () => {
    expect(COMPONENTS.map(item => item.number)).toEqual(COMPONENTS.map((_, index) => index + 1))
    expect(new Set(COMPONENTS.map(item => item.id)).size).toBe(COMPONENTS.length)
  })

  it('places every part on the drawing, and only the parts missing from the CAD model are marked as placed by hand', () => {
    for (const item of COMPONENTS) {
      expect(item.boxes.length > 0 || Boolean(item.cylinder) || Boolean(item.offRobot), item.id).toBe(true)
    }
    expect(COMPONENTS.filter(item => item.virtual).map(item => item.id)).toEqual(['dcdc', 'contactor', 'estop'])
  })

  it('connects every part to at least one wire, and every wire to two known parts', () => {
    for (const item of COMPONENTS) expect(wiresOf(item.id).length, item.id).toBeGreaterThan(0)
    for (const item of WIRES) {
      expect(isInsideId(item.from) && isInsideId(item.to), item.id).toBe(true)
      expect(item.from).not.toBe(item.to)
      expect(WIRE_KINDS.some(kind => kind.kind === item.kind)).toBe(true)
    }
    expect(new Set(WIRES.map(item => item.id)).size).toBe(WIRES.length)
  })

  it('starts and ends every cable on its two parts', () => {
    for (const item of WIRES) {
      for (const route of item.routes) {
        expect(route.length, item.id).toBeGreaterThanOrEqual(2)
        const tolerance = (id: string) => (id === 'tour' ? 0.1 : 0.005)
        expect(distanceTo(component(item.from), route[0]), `${item.id} start`).toBeLessThanOrEqual(tolerance(item.from))
        expect(distanceTo(component(item.to), route[route.length - 1]), `${item.id} end`).toBeLessThanOrEqual(tolerance(item.to))
      }
    }
  })

  it('names only STM32 pins the firmware pin map lists as in use', () => {
    const text = [...WIRES.map(item => item.pins ?? ''), ...COMPONENTS.flatMap(item => item.specs.map(([, value]) => value))].join(' ')
    const pins = new Set(text.match(/\bP[A-C]\d{1,2}\b/g) ?? [])
    expect(pins.size).toBeGreaterThan(20)
    for (const pin of pins) expect(usedPins, pin).toMatch(new RegExp(`\\| ${pin}(-BOOT0)? \\|`))
  })

  it('maps the 3D model\'s part groups to parts of the drawing', () => {
    const groups = new Set(PART_GROUPS.map(group => group.id))
    for (const [group, id] of Object.entries(PART_TO_INSIDE)) {
      expect(groups.has(group as never), group).toBe(true)
      expect(isInsideId(id), group).toBe(true)
    }
  })
})
