import { describe, expect, it } from 'vitest'
import { askFleet, cameraPerception, eventCsv, runWhatIf } from './fleet-analysis'
import { addTask, createPatrol, injectScenario } from './patrol-demo'

describe('grounded fleet tools', () => {
  it('answers from current faults, battery, tasks and source-disclosed camera geometry', () => {
    let state = createPatrol()
    state = injectScenario(state, 'robot-fault', 4)
    state = injectScenario(state, 'low-battery', 6)
    expect(askFleet(state,'Robot R4').answer).toMatch(/R4.*Lỗi thiết bị/)
    expect(askFleet(state,'Tổng quan đội robot').answer).toContain('Đội 6 robot, 10 điểm')
    expect(askFleet(state,'Pin của robot?').answer).toContain('R6: 8%')
    expect(askFleet(state,'Có lỗi nào?').answer).toContain('1 robot lỗi')
    state = addTask(state, 4)
    expect(askFleet(state,'Nhiệm vụ phân công?').answer).toContain('thấp nhất')
    expect(askFleet(state,'Camera').answer).toContain('chưa phải mô hình VLM')
    const offline = injectScenario(state,'camera-outage')
    expect(cameraPerception(offline,1).status).toBe('OFFLINE')
    expect(eventCsv(state)).toContain('R4 gặp lỗi')
  })
  it('compares cloned snapshots with matching random seeds without mutating the live fleet', async () => {
    const state = createPatrol(47), before = structuredClone(state)
    const result = await runWhatIf(state,'robot-fault',1,0,10,3,async()=>{})
    expect(state).toEqual(before)
    expect(result.baseline.faults).toBe(0)
    expect(result.scenario.faults).toBe(1)
    expect(result.scenario.distance).toBeLessThan(result.baseline.distance)
    expect(result.samples).toBe(3)
    await expect(runWhatIf(state,'camera-outage',1,0,10,1,async()=>{},()=>true)).rejects.toThrow('Đã hủy')
  })
})
