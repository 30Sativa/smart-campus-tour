import { describe, expect, it } from 'vitest'
import { createPatrol, stepPatrol, patrolPose, sweptDistance, PATROL_POIS, PATROL_TICK, SAFE_DISTANCE, fleetMetrics, injectScenario, addTask, toggleRobot, findPath } from './patrol-demo'
import { distance, nodePoint } from './patrol-routing'

describe('random six-robot fleet', () => {
  it('uses six scaled robots, ten destinations and repeatable random assignments', () => {
    const a = createPatrol(731), b = createPatrol(731), c = createPatrol(49)
    expect(a).toEqual(b)
    expect(a.robots.map(r => r.target)).not.toEqual(c.robots.map(r => r.target))
    expect(a.robots).toHaveLength(6)
    expect(PATROL_POIS.map(p => p.poi)).toEqual([1,2,3,4,5,6,7,8,9,10])
    for (const p of PATROL_POIS) expect(findPath(PATROL_POIS[0].node, p.node).length || p.poi === 1).toBeTruthy()
  })
  it('keeps entire sweeps separated, actively clears routes for lower numbers and makes progress', () => {
    let state = createPatrol(), observed = false
    const visits = state.robots.map(() => [] as number[])
    for (let tick = 0; tick < 24000; tick++) {
      const old = state; state = stepPatrol(state)
      for (let i=0;i<6;i++) {
        const r=state.robots[i], before=old.robots[i]
        expect(distance(r.pose, before.pose)).toBeLessThanOrEqual(r.speed * PATROL_TICK + 1e-6)
        if (r.yieldTo !== null) expect(r.yieldTo).toBeLessThan(r.number)
        if (r.visits > before.visits) visits[i].push(r.observing!)
        if (r.mode === 'observing' && before.mode === 'observing') { observed=true; expect(r.pose).toEqual(before.pose); expect(r.remaining).toBeCloseTo(Math.max(0,before.remaining-PATROL_TICK),6) }
        for(let j=i+1;j<6;j++) {
          const a=before.pose,b=r.pose,c=old.robots[j].pose,d=state.robots[j].pose
          const separation=sweptDistance({x:a.x-c.x,y:a.y-c.y},{x:b.x-d.x,y:b.y-d.y},{x:0,y:0})
          if(separation < SAFE_DISTANCE-1e-7) throw Error(`Collision tick ${tick}: R${i+1}/R${j+1} ${separation}`)
        }
      }
    }
    expect(observed).toBe(true)
    expect(fleetMetrics(state).yields).toBeGreaterThan(0)
    expect(state.events.some(e=>e.kind==='bay')).toBe(true)
    for(const v of visits) expect(v.length).toBeGreaterThan(3)
    expect(visits.some(v=>v.slice(1).some((p,i)=>p !== (v[i]+1)%10))).toBe(true)
    expect(()=>stepPatrol(state,2)).toThrow(/100 ms/)
  },30000)
  it.each([2,1945,2026])('continues serving all six robots for random seed %s', seed=>{
    let state=createPatrol(seed)
    for(let tick=0;tick<24000;tick++)state=stepPatrol(state)
    for(const r of state.robots)expect(r.visits,`R${r.number}: ${r.mode}, nhường ${r.yieldTo}, đích ${r.target+1}`).toBeGreaterThan(0)
  },30000)
  it('observes for 60 seconds, pauses independently, assigns tasks and recovers scenarios', () => {
    let state=createPatrol()
    const r=state.robots[0]
    r.pose={...nodePoint(r.node),yaw:0}; r.path=[]; r.target=PATROL_POIS.findIndex(p=>p.node===r.node)
    state=stepPatrol(state)
    expect(state.robots[0].remaining).toBe(60)
    state=toggleRobot(state,1)
    const pose=patrolPose(state.robots[0])
    for(let i=0;i<30;i++) state=stepPatrol(state)
    expect(state.robots[0].pose).toEqual(pose)
    expect(state.robots[0].remaining).toBe(60)
    const tasks=addTask(state,9)
    expect(tasks.robots.reduce((n,r)=>n+r.queue.length,0)).toBe(1)
    expect(tasks.decisions[0]).toMatch(/điểm .* thấp nhất/)
    expect(injectScenario(tasks,'robot-fault',3).robots[2].mode).toBe('fault')
    expect(injectScenario(injectScenario(tasks,'robot-fault',3),'recover',3).robots[2].mode).not.toBe('fault')
    expect(injectScenario(tasks,'low-battery',4).robots[3].battery).toBe(8)
    expect(injectScenario(tasks,'block-point',1,4).blocked).toHaveLength(1)
    expect(injectScenario(tasks,'camera-outage').cameraOffline).toBe(true)
  })
  it('finishes a task only after the full 60-second dwell', () => {
    let state=createPatrol()
    state.robots=state.robots.slice(0,1)
    const r=state.robots[0], task=state.tasks.find(t=>t.id===r.activeTask)!
    r.node=PATROL_POIS[r.target].node; r.pose={...nodePoint(r.node),yaw:0}; r.path=[]
    state=stepPatrol(state)
    const arrived=state.seconds, pose={...state.robots[0].pose}
    for(let i=0;i<1199;i++)state=stepPatrol(state)
    expect(state.robots[0].mode).toBe('observing')
    expect(state.robots[0].pose).toEqual(pose)
    expect(state.completedCount).toBe(0)
    expect(state.tasks.find(t=>t.id===task.id)?.status).toBe('running')
    state=stepPatrol(state)
    expect(state.seconds-arrived).toBeCloseTo(60,6)
    expect(state.tasks.find(t=>t.id===task.id)?.status).toBe('completed')
    expect(state.completedCount).toBe(1)
    expect(state.onTimeCount).toBe(1)
    expect(task.status).toBe('running')
  })
  it('defers a low-battery task, charges and returns to that task without counting charging as completion', () => {
    let state=createPatrol()
    state.robots=state.robots.slice(0,1)
    const r=state.robots[0], task=r.activeTask!, originalTarget=r.target
    r.node=PATROL_POIS[5].node; r.pose={...nodePoint(r.node),yaw:0}; r.path=[]; r.battery=8
    state=stepPatrol(state)
    expect(state.robots[0].mode).toBe('charging')
    expect(state.tasks.find(t=>t.id===task)?.status).toBe('queued')
    for(let i=0;i<3480;i++)state=stepPatrol(state)
    expect(state.robots[0].battery).toBeCloseTo(95,5)
    expect(state.robots[0].mode).toBe('moving')
    expect(state.robots[0].target).toBe(originalTarget)
    expect(state.robots[0].activeTask).toBe(task)
    expect(state.tasks.find(t=>t.id===task)?.status).toBe('running')
    expect(state.completedCount).toBe(0)
  })
  it('routes around blocked cells and waits when a destination is blocked', () => {
    const start=PATROL_POIS[0].node, goal=PATROL_POIS[3].node
    const path=findPath(start,goal), blocked=path[Math.floor(path.length/2)]
    const rerouted=findPath(start,goal,new Set([blocked]))
    expect(rerouted.length).toBeGreaterThan(0)
    expect(rerouted).not.toContain(blocked)
    expect(findPath(start,goal,new Set([goal]))).toEqual([])
  })
})
