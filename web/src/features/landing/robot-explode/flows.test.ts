import { describe, expect, it } from 'vitest'
import { FLOWS, FLOW_NODES, SIGNAL_KINDS, flowNode, parseBody, stepParts } from './flows'
import { PART_GROUPS } from './parts'

describe('robot signal flows', () => {
  it('only links nodes that exist, and only lights parts the model has', () => {
    const nodes = new Set(FLOW_NODES.map(node => node.id))
    const parts = new Set(PART_GROUPS.map(group => group.id))
    for (const node of FLOW_NODES) if (node.part) expect(parts.has(node.part), node.id).toBe(true)
    for (const flow of FLOWS) {
      expect(flow.steps.length).toBeGreaterThan(1)
      for (const step of flow.steps) {
        expect(step.links.length, `${flow.id}: ${step.title}`).toBeGreaterThan(0)
        for (const link of step.links) {
          expect(nodes.has(link.from)).toBe(true)
          expect(nodes.has(link.to)).toBe(true)
          expect(link.from).not.toBe(link.to)
        }
        for (const part of stepParts(step)) expect(parts.has(part)).toBe(true)
      }
    }
  })

  it('follows a drive command from the mini PC down to the wheels and back', () => {
    const drive = FLOWS.find(flow => flow.id === 'drive')!
    const chain = drive.steps.flatMap(step => step.links.map(link => `${link.from}>${link.to}`))
    expect(chain).toEqual(['pc>mcu', 'mcu>driver', 'driver>motor', 'motor>wheel', 'mcu>pc'])
    expect(drive.steps.at(-1)!.links[0].kind).toBe('feedback')
    expect(drive.steps.some(step => step.motion === 'wheels')).toBe(true)
  })

  it('turns the wheels whenever a step talks about them or drives them, and swings the head through the whole head flow', () => {
    for (const flow of FLOWS) for (const step of flow.steps) {
      if (/bánh/i.test(step.body) || flow.id === 'drive') expect(step.motion, step.title).toBe('wheels')
    }
    expect(FLOWS.find(flow => flow.id === 'head')!.steps.every(step => step.motion === 'head')).toBe(true)
  })

  it('underlines marked words in their signal colour and leaves the rest plain', () => {
    expect(parseBody('[[Mini PC|command]] gửi lệnh tới [[STM32|feedback]].')).toEqual([
      { text: 'Mini PC', kind: 'command' },
      { text: ' gửi lệnh tới ' },
      { text: 'STM32', kind: 'feedback' },
      { text: '.' },
    ])
    expect(parseBody('[[chữ|lạ]] thường')).toEqual([{ text: 'chữ' }, { text: ' thường' }])
    // Every marked word in the real copy uses a known signal kind.
    const kinds = new Set(SIGNAL_KINDS.map(item => item.kind))
    for (const flow of FLOWS) for (const step of flow.steps) {
      for (const match of step.body.matchAll(/\[\[[^|\]]+\|([a-z]+)\]\]/g)) expect(kinds.has(match[1] as never), step.title).toBe(true)
    }
  })

  it('lights both ends of each link and the extra parts', () => {
    const step = FLOWS.find(flow => flow.id === 'head')!.steps[2]
    expect(new Set(stepParts(step))).toEqual(new Set(['drv', 'pantilt', 'head', 'quest']))
    expect(flowNode('cloud').part).toBeNull()
  })
})
