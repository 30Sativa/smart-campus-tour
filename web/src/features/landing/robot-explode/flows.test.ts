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

  it('follows a drive command from the mini PC down to the motors, which turn the wheels', () => {
    const drive = FLOWS.find(flow => flow.id === 'drive')!
    const chain = drive.steps.flatMap(step => step.links.map(link => `${link.from}>${link.to}`))
    expect(chain).toEqual(['pc>mcu', 'mcu>driver', 'driver>motor'])
    expect(drive.steps.map(step => step.motion ?? null)).toEqual([null, null, 'wheels'])
  })

  it('turns the wheels only where a command reaches the motors, and swings the head through the whole head flow', () => {
    for (const flow of FLOWS) for (const step of flow.steps) {
      const drives = step.links.some(link => link.to === 'motor' && link.kind === 'command')
      expect(step.motion === 'wheels', `${flow.id}: ${step.title}`).toBe(drives)
    }
    expect(FLOWS.find(flow => flow.id === 'head')!.steps.every(step => step.motion === 'head')).toBe(true)
  })

  it('brings the ultrasonic reading from the sensor heads through the SR04T boards and the STM32 to the mini PC, one hop a step', () => {
    const sense = FLOWS.find(flow => flow.id === 'sense')!
    const start = sense.steps.findIndex(step => step.links[0].from === 'sonar')
    const hops = sense.steps.slice(start, start + 3).map(step => step.links.map(link => `${link.from}>${link.to}`))
    expect(hops).toEqual([['sonar>sr04t'], ['sr04t>mcu'], ['mcu>pc']])
    expect(sense.steps[start].motion).toBe('sonar')
    // Readings that reach the STM32 always go on up to the mini PC, in the same step or the next.
    sense.steps.forEach((step, index) => {
      if (!step.links.some(link => link.to === 'mcu')) return
      const next = [...step.links, ...(sense.steps[index + 1]?.links ?? [])]
      expect(next.some(link => link.from === 'mcu' && link.to === 'pc'), step.title).toBe(true)
    })
    // The sensor heads and the SR04T boards are different pieces of the same model part.
    expect(flowNode('sonar').pieces).toHaveLength(4)
    expect(flowNode('sr04t').pieces).toHaveLength(4)
    expect(flowNode('sonar').pieces!.some(piece => flowNode('sr04t').pieces!.includes(piece))).toBe(false)
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
