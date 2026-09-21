import { beforeEach, describe, expect, it } from 'vitest'
import * as world from './staff-sim'

/**
 * The mock backend's rules, which in the real system are the server's. They
 * are tested here because the console's demo depends on them behaving as the
 * remote-tour scope says: Start only from Ready, one robot per run, Hold only
 * at a POI, one close per visit, NeedsAssistance drops automatic steps, and
 * recovery / End Early behave as §12 describes.
 */
const view = (id: string) => world.tourView(world.tourById(id)!)
const confirmed = { robotPlaced: true, areaClear: true, previewChecked: true }

/** Advance in 1 s steps, the way the push channel does. */
function run(seconds: number) {
  for (let i = 0; i < seconds; i += 1) world.tick(1)
}

describe('remote-tour simulation', () => {
  beforeEach(() => world.resetSim())

  it('never starts a Scheduled session, and starts a Ready one only when the robot is free', () => {
    expect(() => world.startTour('tour-03', confirmed)).toThrow(/Admin/)
    expect(view('tour-02').allowedActions.start).toMatchObject({ allowed: false, reason: 'Đang phục vụ T-01' })
    expect(() => world.startTour('tour-02', confirmed)).toThrow(world.SimRejection)
  })

  it('takes the robot at Start after End Early and an on-site confirmation', () => {
    world.command('tour-01', 'endEarly', 'Diễn tập kết thúc sớm')
    expect(view('tour-01').state).toBe('Cancelled')
    const robot = world.sim.robotById('robot_01')!
    expect(world.robotView(robot).needsCheck).toBe(true)
    expect(view('tour-02').allowedActions.start.allowed).toBe(false)
    expect(() => world.confirmRobotReady('robot_01')).toThrow(/đã dừng/)

    run(3)
    world.confirmRobotReady('robot_01')
    expect(view('tour-02').allowedActions.start.allowed).toBe(true)
    expect(() => world.startTour('tour-02', { ...confirmed, areaClear: false })).toThrow(/xác nhận/)

    world.startTour('tour-02', confirmed)
    const started = view('tour-02')
    expect(started).toMatchObject({ state: 'Running', operationalStatus: 'Normal', robotId: 'robot_01' })
    expect(started.progress?.step).toBe('PreparingStart')
  })

  it('needs a reason to end early', () => {
    expect(() => world.command('tour-01', 'endEarly', '  ')).toThrow(/lý do/)
  })

  it('enters NeedsAssistance on a navigation failure and recovers with a new leg id', () => {
    const before = view('tour-01').progress?.legId
    run(9)
    const failed = view('tour-01')
    expect(failed).toMatchObject({ state: 'Running', operationalStatus: 'NeedsAssistance', reason: 'NavigationFailed' })
    expect(failed.allowedActions.next.allowed).toBe(false)
    expect(failed.allowedActions.retryLeg.allowed).toBe(true)

    world.command('tour-01', 'retryLeg')
    const retried = view('tour-01')
    expect(retried.operationalStatus).toBe('Normal')
    expect(retried.progress?.legId).not.toBe(before)
  })

  it('holds only at a POI, and Next closes the visit exactly once', () => {
    run(9)
    world.command('tour-01', 'retryLeg')
    expect(view('tour-01').allowedActions.hold.allowed).toBe(false)
    for (let i = 0; i < 40 && view('tour-01').progress?.step !== 'Observing'; i += 1) world.tick(1)
    expect(view('tour-01').progress?.step).toBe('Observing')

    world.command('tour-01', 'hold')
    run(30)
    const held = view('tour-01')
    expect(held.progress?.step).toBe('Observing')
    expect(held.progress?.hold).toBe(true)

    world.command('tour-01', 'next')
    expect(view('tour-01').progress?.step).toBe('ReturningFront')
    expect(() => world.command('tour-01', 'next')).toThrow(world.SimRejection)
    const closes = world.tourDetailView(world.tourById('tour-01')!).events.filter((event) => event.type === 'VisitClosed')
    expect(closes.filter((event) => event.detail?.includes('Thư viện'))).toHaveLength(1)
  })
})
