import { describe, expect, it } from 'vitest'
import { createPatrol, stepPatrol, patrolPose, sweptDistance, PATROL_CIRCUIT, PATROL_POIS, PATROL_TICK, SAFE_DISTANCE, YIELD_TRIGGER_DISTANCE, fleetMetrics, injectScenario, addTask, toggleRobot, findPath } from './patrol-demo'
import { distance, nodePoint } from './patrol-routing'

describe('six-robot circuit fleet', () => {
  it('uses six scaled robots, ten destinations and repeatable random skipped stops', () => {
    const a = createPatrol(731), b = createPatrol(731), c = createPatrol(49)
    expect(a).toEqual(b)
    expect(a.robots.map(r => r.lapSkipped)).not.toEqual(c.robots.map(r => r.lapSkipped))
    for (const r of a.robots) {
      expect(new Set(r.lapSkipped).size).toBe(r.lapSkipped.length)
      expect(r.lapSkipped.length).toBeGreaterThanOrEqual(1)
      expect(r.lapSkipped.length).toBeLessThanOrEqual(3)
      expect(r.lapRoute.at(-1)).toBe(r.lapOrigin)
    }
    expect(a.robots).toHaveLength(6)
    expect(PATROL_POIS.map(p => p.poi)).toEqual([1,2,3,4,5,6,7,8,9,10])
    for (const p of PATROL_POIS) expect(findPath(PATROL_POIS[0].node, p.node).length || p.poi === 1).toBeTruthy()
  })
  it.each([713, 731])('returns to the starting point through the full circuit, skipping only dwell (%s)', seed => {
    let state = createPatrol(seed)
    state.robots = state.robots.slice(0, 1)
    const initial = state.robots[0], skipped = new Set(initial.lapSkipped)
    const expected = [initial.target, ...initial.lapRoute], reached: number[] = []
    for (let tick = 0; tick < 30000 && state.robots[0].laps === 0; tick++) {
      const before = state
      if (skipped.has(before.robots[0].target)) expect(before.robots[0].activeTask).toBeNull()
      state = stepPatrol(state)
      const events = state.events.filter(e => e.sequence > before.eventSequence && ['arrived', 'passed'].includes(e.kind)).reverse()
      for (const event of events) {
        const point = Number(event.message.match(/Điểm (\d+)/)?.[1]) - 1
        reached.push(point)
        expect(event.kind).toBe(skipped.has(point) ? 'passed' : 'arrived')
      }
    }
    expect(state.robots[0].laps).toBe(1)
    expect(reached).toEqual(expected)
    expect(new Set(reached)).toEqual(new Set(PATROL_CIRCUIT.filter(p => p !== 1 || !skipped.has(p))))
    expect(state.robots[0].node).toBe(PATROL_POIS[initial.lapOrigin].node)
  }, 30000)
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
    const progress = JSON.stringify(state.robots.map(r => ({ robot: r.number, visits: r.visits, laps: r.laps, mode: r.mode, yieldTo: r.yieldTo, bay: r.bay, point: r.target + 1, pose: r.pose, path: r.path.slice(0, 3), wait: r.blockedSeconds })))
    for(const v of visits) expect(v.length, progress).toBeGreaterThan(3)
    expect(visits.some(v=>v.slice(1).some((p,i)=>p !== (v[i]+1)%10))).toBe(true)
    expect(()=>stepPatrol(state,2)).toThrow(/100 ms/)
  },30000)
  it.each([2,1945,2026])('continues serving all six robots for random seed %s', seed=>{
    let state=createPatrol(seed)
    for(let tick=0;tick<24000;tick++)state=stepPatrol(state)
    for(const r of state.robots)expect(r.visits,`R${r.number}: ${r.mode}, nhường ${r.yieldTo}, đích ${r.target+1}`).toBeGreaterThan(0)
  },30000)
  it('serves waiting bays and lets every robot finish a circuit through the narrow branch', () => {
    let state = createPatrol(), queued = false
    for (let tick = 0; tick < 72000; tick++) {
      state = stepPatrol(state)
      queued ||= state.robots.some(r => r.branchWaiting)
      if (state.robots.every(r => r.laps > 0)) break
    }
    expect(queued).toBe(true)
    const progress = JSON.stringify({ branches: state.branchOwners, robots: state.robots.map(r => ({ robot: r.number, mode: r.mode, point: r.target + 1, visits: r.visits, laps: r.laps, branch: r.branchWaiting, yieldTo: r.yieldTo, arrival: r.yieldUntilArrival, bay: r.bay, pose: r.pose, path: r.path.slice(0, 3), wait: r.blockedSeconds })) })
    for (const r of state.robots) expect(r.laps, `R${r.number} must leave its waiting bay and complete a lap: ${progress}`).toBeGreaterThan(0)
  }, 30000)
  it('requests priority bays only nearby, then parks until the priority robot finishes its leg', () => {
    let state = createPatrol(), parked = 0, resumed = 0, requests = 0
    for (let tick = 0; tick < 24000; tick++) {
      const before = state
      state = stepPatrol(state)
      for (const r of state.robots) {
        const old = before.robots.find(other => other.number === r.number)!
        if (r.yieldTo !== null && r.yieldCount > old.yieldCount) {
          requests++
          const high = before.robots.find(other => other.number === r.yieldTo)!
          expect(distance(old.pose, high.pose)).toBeLessThanOrEqual(YIELD_TRIGGER_DISTANCE + 1e-6)
          expect(r.yieldTo).toBeLessThan(r.number)
        }
        if (old.mode === 'yielded' && old.yieldTo !== null && old.yieldUntilArrival !== null) {
          const nextHigh = state.robots.find(other => other.number === old.yieldTo)!
          if (nextHigh.arrivals < old.yieldUntilArrival && r.yieldCount === old.yieldCount) {
            parked++
            expect(r.pose).toEqual(old.pose)
            expect(r.yieldTo).not.toBeNull()
          }
          if (r.yieldTo === null) resumed++
        }
      }
    }
    expect(requests).toBeGreaterThan(0)
    expect(parked).toBeGreaterThan(0)
    expect(resumed).toBeGreaterThan(0)
  }, 30000)
  it('observes for 60 seconds, pauses independently, assigns tasks and recovers scenarios', () => {
    let state=createPatrol()
    const r=state.robots[0]
    r.lapSkipped = r.lapSkipped.filter(point => point !== 0)
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
