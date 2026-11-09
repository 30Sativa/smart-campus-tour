/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { Box3, Mesh, Vector3 } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
import { describe, expect, it } from 'vitest'
import { ASSEMBLY_ORDER, PART_GROUPS, explodeOffset, groupOfNode, orderMoves, pairMoves, partGroup, planAssembly, stepApart, stepAt } from './parts'

describe('robot part catalog', () => {
  it('names each group once and reads the group from a model node name', () => {
    expect(new Set(PART_GROUPS.map(group => group.id)).size).toBe(PART_GROUPS.length)
    expect(groupOfNode('shell__07')).toBe('shell')
    expect(groupOfNode('quest__01')).toBe('quest')
    expect(groupOfNode('Scene')).toBeNull()
  })

  it('keeps the frame still and takes the rest off it', () => {
    expect(explodeOffset(partGroup('frame').explode, [0.1, 0.4, 0.2])).toEqual([0, 0, 0])
    expect(explodeOffset(partGroup('lid').explode, [0, 0.46, 0])[1]).toBeGreaterThan(0.3)
    // A side panel leaves through its own side, a front panel through the front.
    const side = explodeOffset(partGroup('shell').explode, [0.27, 0.35, 0.05])
    expect(side[0]).toBeGreaterThan(0.2)
    expect(side[2]).toBe(0)
    const front = explodeOffset(partGroup('shell').explode, [0, 0.35, 0.39])
    expect(front[2]).toBeGreaterThan(0.2)
    expect(front[0]).toBe(0)
    // A corner piece goes out diagonally; the casters drop.
    const corner = explodeOffset(partGroup('shell').explode, [-0.25, 0.2, -0.36])
    expect(corner[0]).toBeLessThan(0)
    expect(corner[2]).toBeLessThan(0)
    expect(explodeOffset(partGroup('caster').explode, [0.15, 0.09, 0.3])[1]).toBeLessThan(0)
    // Taken apart, the LiDAR sits above the lid and below the column.
    const lid = 0.46 + explodeOffset(partGroup('lid').explode, [0, 0.46, 0])[1]
    const lidar = 0.47 + explodeOffset(partGroup('lidar').explode, [0, 0.47, 0])[1]
    const columnBottom = 0.5 + explodeOffset(partGroup('column').explode, [0, 0.66, 0])[1]
    expect(lidar - lid).toBeGreaterThan(0.15)
    expect(columnBottom - lidar).toBeGreaterThan(0.1)
    // The headset rises clear of the head it sits on.
    const head = explodeOffset(partGroup('head').explode, [0, 1.15, 0])
    const quest = explodeOffset(partGroup('quest').explode, [0, 1.16, 0])
    expect(quest[1] - head[1]).toBeGreaterThan(0.1)
  })

  it('puts the robot together one piece at a time, frame first and screws last', () => {
    expect([...ASSEMBLY_ORDER].sort()).toEqual(PART_GROUPS.map(group => group.id).sort())
    expect(ASSEMBLY_ORDER[0]).toBe('frame')
    const { steps } = planAssembly({ frame: 1, wheel: 2, lid: 1, shell: 3, screw: 4 })
    expect(steps.get('frame')).toBeUndefined()
    const all = [...steps.values()].flat().sort((a, b) => a.start - b.start)
    expect(all.map(step => `${step.group}${step.number}`)).toEqual(['wheel1', 'wheel2', 'lid1', 'shell1', 'shell2', 'shell3', 'screw1', 'screw2', 'screw3', 'screw4'])
    // Never two pieces moving at once: each move ends before the next one starts.
    for (let i = 1; i < all.length; i += 1) expect(all[i].start).toBeGreaterThan(all[i - 1].start + all[i - 1].length)
    expect(all[0].start).toBe(0)
    expect(all.at(-1)!.start + all.at(-1)!.length).toBeLessThanOrEqual(1)
    // Fully apart, every piece is away; put together, every piece is in place; the frame never moves.
    for (const step of all) {
      expect(stepApart(1, step)).toBe(1)
      expect(stepApart(0, step)).toBe(0)
    }
    expect(stepApart(0.5, undefined)).toBe(0)
    // Part way: the wheels are on, the screws are not yet.
    expect(stepApart(0.6, steps.get('wheel')![1])).toBe(0)
    expect(stepApart(0.6, steps.get('screw')![0])).toBe(1)
  })

  it('orders the moves by group, then round the body from the front, or from the bottom up', () => {
    const ordered = orderMoves([
      { id: 'screw-back', group: 'screw', centre: [0, 0.2, -0.4] },
      { id: 'shell-right', group: 'shell', centre: [0.28, 0.3, 0] },
      { id: 'pantilt-top', group: 'pantilt', centre: [0, 0.99, 0] },
      { id: 'screw-front', group: 'screw', centre: [0, 0.2, 0.4] },
      { id: 'shell-front', group: 'shell', centre: [0, 0.3, 0.4] },
      { id: 'wheel-left', group: 'wheel', centre: [-0.21, 0.1, 0] },
      { id: 'pantilt-base', group: 'pantilt', centre: [0, 0.88, 0] },
      { id: 'shell-left', group: 'shell', centre: [-0.28, 0.3, 0] },
    ] as const)
    expect(ordered.map(move => move.id)).toEqual([
      'wheel-left', 'pantilt-base', 'pantilt-top', 'shell-front', 'shell-right', 'shell-left', 'screw-front', 'screw-back',
    ])
  })

  it('moves mirrored twins as one pair, every screw at once, and a middle piece alone', () => {
    const wheel = (id: string, x: number) => ({ id, group: 'wheel' as const, centre: [x, 0.1, 0] as const, size: [0.05, 0.19, 0.19] as const })
    const shell = (id: string, x: number, z: number, width = 0.014) => ({ id, group: 'shell' as const, centre: [x, 0.35, z] as const, size: [width, 0.24, 0.22] as const })
    const screw = (id: string, x: number) => ({ id, group: 'screw' as const, centre: [x, 0.2, 0.3] as const, size: [0.016, 0.007, 0.007] as const })
    const moves = pairMoves([
      wheel('wheel-l', -0.216), wheel('wheel-r', 0.216),
      shell('side-l-front', -0.274, 0.22), shell('side-r-front', 0.274, 0.22), shell('side-r-back', 0.274, -0.22),
      shell('front', 0, 0.39, 0.44),
      screw('s1', 0.27), screw('s2', -0.27), screw('s3', 0.1),
    ]).map(move => move.map(unit => unit.id).sort().join('+'))
    expect(moves).toEqual(['wheel-l+wheel-r', 'side-l-front+side-r-front', 'side-r-back', 'front', 's1+s2+s3'])
  })

  it('names the move under way, with its number among the pieces of its part', () => {
    const { steps } = planAssembly({ wheel: 2, screw: 4 })
    expect(stepAt(0, steps)).toBeNull()
    expect(stepAt(1, steps)).toBeNull()
    const lastScrew = steps.get('screw')![3]
    expect(stepAt(1 - (lastScrew.start + lastScrew.length / 2), steps)).toBe(lastScrew)
    const firstWheel = steps.get('wheel')![0]
    expect(stepAt(1 - firstWheel.length / 2, steps)).toBe(firstWheel)
  })
})

describe('exploded robot asset', () => {
  it('holds every part of the SolidWorks assembly, in metres, standing on the floor', async () => {
    const bytes = Uint8Array.from(readFileSync('public/models/robot/campus-amr-explode.glb'))
    await MeshoptDecoder.ready
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
    const { scene } = await loader.parseAsync(bytes.buffer, '')
    const counts = new Map<string, number>()
    scene.traverse(node => {
      if (!(node instanceof Mesh)) return
      const group = groupOfNode(node.name)
      expect(group, node.name).not.toBeNull()
      counts.set(group!, (counts.get(group!) ?? 0) + 1)
    })
    for (const group of PART_GROUPS) expect(counts.get(group.id), group.id).toBeGreaterThan(0)
    expect(counts.get('screw')).toBe(32)
    expect(counts.get('wheel')).toBe(2)
    expect(counts.get('quest')).toBe(1)
    const bounds = new Box3().setFromObject(scene)
    const size = bounds.getSize(new Vector3())
    expect(size.x).toBeCloseTo(0.563, 2)
    expect(size.z).toBeCloseTo(0.803, 2)
    expect(size.y).toBeCloseTo(1.276, 2)
    expect(bounds.min.y).toBeCloseTo(0, 3)
  })
})
