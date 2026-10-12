import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { patrolGeometry, segmentDistance, insideTriangle } from './patrol-geometry.mjs'
const nav = JSON.parse(readFileSync('src/features/digital-twin/patrol-nav.json','utf8'))
function spatial(items, points, margin=0) {
  const bins=new Map()
  for(const item of items) {const p=points(item); for(let x=Math.floor((Math.min(...p.map(v=>v[0]))-margin)/3); x<=Math.floor((Math.max(...p.map(v=>v[0]))+margin)/3);x++) for(let y=Math.floor((Math.min(...p.map(v=>v[1]))-margin)/3);y<=Math.floor((Math.max(...p.map(v=>v[1]))+margin)/3);y++){const key=`${x},${y}`;if(!bins.has(key))bins.set(key,[]);bins.get(key).push(item)}}
  return p=>bins.get(`${Math.floor(p[0]/3)},${Math.floor(p[1]/3)}`)||[]
}
describe('GLB fleet navigation snapshot',()=>{
  it('matches the model and all ten points belong to a connected, bidirectional graph',()=>{
    expect(nav.modelSha256).toBe(createHash('sha256').update(readFileSync('public/models/simulator-map/NVHSV_Tang6_V3_modern_v2.glb')).digest('hex'))
    const found=new Set(),todo=[nav.pois[0].node]
    while(todo.length){const i=todo.pop();if(found.has(i))continue;found.add(i);for(const j of nav.nodes[i].edges){expect(nav.nodes[j].edges).toContain(i);todo.push(j)}}
    expect(found.size).toBe(nav.nodes.length)
    expect(nav.pois).toHaveLength(10)
    for(const p of nav.pois){expect(found.has(p.node)).toBe(true);expect(nav.nodes[p.node].p).toEqual([p.x,p.y])}
  })
  it('keeps every edge on floor and the entire robot body envelope clear of walls, glass and furniture',()=>{
    const geometry=patrolGeometry(), obstacles=spatial(geometry.edges,e=>[e.a,e.b],nav.clearance), floors=spatial(geometry.floors,t=>t)
    for(let i=0;i<nav.nodes.length;i++)for(const j of nav.nodes[i].edges){if(j<i)continue;const a=nav.nodes[i].p,b=nav.nodes[j].p
      for(let k=0;k<=10;k++){const p=a.map((v,n)=>v+(b[n]-v)*k/10)
        if(!floors(p).some(t=>insideTriangle(p,t)))throw Error(`No floor on ${i}->${j}`)
        for(const e of obstacles(p))if(segmentDistance(p,e.a,e.b)<nav.clearance-1e-6)throw Error(`Footprint touches ${e.name} on ${i}->${j}`)
      }
    }
  },30000)
})
