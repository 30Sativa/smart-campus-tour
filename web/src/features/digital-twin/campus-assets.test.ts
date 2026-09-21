import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { Box3 } from 'three'
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js'
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js'

describe('simulator map assets', () => {
  it('loads the shipped OBJ with every referenced material and finite geometry', () => {
    const obj = readFileSync('public/models/simulator-map/map.obj', 'utf8')
    const mtl = readFileSync('public/models/simulator-map/map.mtl', 'utf8')
    const materials = new MTLLoader().parse(mtl, '')
    const usedMaterials = [...obj.matchAll(/^usemtl (.+)$/gm)].map((match) => match[1].trim())
    expect(usedMaterials.length).toBeGreaterThan(0)
    for (const name of usedMaterials) expect(Object.keys(materials.materialsInfo)).toContain(name)
    const model = new OBJLoader().setMaterials(materials).parse(obj)
    const bounds = new Box3().setFromObject(model)
    expect(bounds.isEmpty()).toBe(false)
    expect([...bounds.min.toArray(), ...bounds.max.toArray()].every(Number.isFinite)).toBe(true)
    expect(bounds.max.x - bounds.min.x).toBeGreaterThan(0)
    // This asset is self-contained; missing texture files must not silently ship.
    expect(mtl).not.toMatch(/^\s*(map_\w+|bump|disp|decal)\s/im)
  })
})
