import { beforeEach, describe, expect, it } from 'vitest'
import * as admin from './admin-sim'
import * as rep from './representative-sim'
import { resetSim } from './staff-sim'

/**
 * The representative rules of the screen & user flow review (21/09/2026) §4
 * and §7, on the shared mock world: what a representative sends is what Admin
 * reviews, and Admin's decision is what the representative sees.
 */
const ME = 'mock-user-daidien'
const OTHER = 'mock-user-someone-else'

const input = (count = 3, className: string | null = '10A1') => ({
  schoolName: 'THPT Trần Phú',
  representativeName: 'Cô Lê Thanh Vy',
  contactEmail: 'daidien.tranphu@truong-mau.example',
  roster: Array.from({ length: count }, (_, i) => ({ name: `Học sinh ${i + 1}`, className })),
})

let seq = 0
const requestId = () => `req-${(seq += 1)}`

function error(run: () => unknown) {
  try {
    run()
  } catch (e) {
    return (e as rep.RepresentativeRejection).body
  }
  throw new Error('expected a refusal')
}

beforeEach(() => resetSim())

describe('representative area on the shared mock world', () => {
  it('sees only their own registrations, one per state worth showing', () => {
    const mine = rep.listRegistrations(ME)
    expect(mine.map((r) => r.state).sort()).toEqual(['Approved', 'Approved', 'Approved', 'Rejected'])
    expect(rep.listRegistrations(OTHER)).toEqual([])
    expect(error(() => rep.getRegistration('reg-01', ME)).code).toBe('NotFound')
  })

  it('shows the rejection reason to the representative', () => {
    const rejected = rep.listRegistrations(ME).find((r) => r.state === 'Rejected')!
    expect(rejected.rejectionReason).toMatch(/Lop/)
    expect(rejected.allowedActions.edit.allowed).toBe(true)
  })

  it('offers registration only on Scheduled Tours without an active registration of theirs', () => {
    const tours = rep.listTours(ME)
    const byId = Object.fromEntries(tours.map((t) => [t.id, t]))
    expect(byId['tour-06'].register.allowed).toBe(true)
    expect(byId['tour-03'].register.allowed).toBe(false) // already registered
    expect(byId['tour-02'].register.reason).toMatch(/chốt danh sách/)
    expect(byId['tour-01'].register.reason).toBe('Buổi đang diễn ra.')
    expect(byId['tour-01'].register.allowed).toBe(false) // Running
  })

  it('sends a group that Admin then finds in the review queue', () => {
    const sent = rep.submit('tour-06', input(4), 'req-dup', ME)
    expect(sent.state).toBe('Submitted')
    expect(sent.participation).toBeNull()
    const queue = admin.listRegistrations({ tourId: 'tour-06', state: 'Submitted' })
    expect(queue.map((r) => r.id)).toContain(sent.id)
    // A repeated click with the same request id does not create a second group.
    expect(rep.submit('tour-06', input(4), 'req-dup', ME).id).toBe(sent.id)
    expect(admin.listRegistrations({ tourId: 'tour-06' })).toHaveLength(1)
  })

  it('refuses a second registration for the same Tour', () => {
    rep.submit('tour-06', input(), requestId(), ME)
    expect(error(() => rep.submit('tour-06', input(), requestId(), ME)).code).toBe('NotAllowed')
  })

  it('gives the join link and group code only after Admin approves', () => {
    const sent = rep.submit('tour-06', input(), requestId(), ME)
    const detail = admin.getRegistration(sent.id)
    admin.approveRegistration(sent.id, detail.version, 'admin')
    const approved = rep.getRegistration(sent.id, ME)
    expect(approved.state).toBe('Approved')
    expect(approved.participation?.groupCode).toBe(detail.groupCode)
    expect(approved.participation?.joinLink).toMatch(/T-06$/)
  })

  it('sends a Rejected group back to review after a fix', () => {
    const rejected = rep.listRegistrations(ME).find((r) => r.state === 'Rejected')!
    const fixed = rep.update(rejected.id, input(22), rejected.version, ME)
    expect(fixed.state).toBe('Submitted')
    expect(fixed.rejectionReason).toBeNull()
  })

  it('replaces the roster of an approved group, which goes back to review', () => {
    const approved = rep.getRegistration('reg-09', ME)
    const replaced = rep.update('reg-09', { ...input(5), schoolName: approved.schoolName, representativeName: approved.representativeName, contactEmail: approved.contactEmail }, approved.version, ME)
    expect(replaced.state).toBe('Submitted')
    expect(replaced.resubmittedAfterApproval).toBe(true)
    expect(replaced.participation).toBeNull()
  })

  it('does not change the e-mail of an approved group (flow §10.2) or accept an unchanged roster', () => {
    const approved = rep.getRegistration('reg-09', ME)
    const same = { schoolName: approved.schoolName, representativeName: approved.representativeName, contactEmail: approved.contactEmail, roster: approved.roster }
    expect(error(() => rep.update('reg-09', { ...same, contactEmail: 'moi@truong-mau.example' }, approved.version, ME)).fieldErrors?.contactEmail).toMatch(/Admin/)
    expect(error(() => rep.update('reg-09', same, approved.version, ME)).fieldErrors?.roster).toBeTruthy()
  })

  it('cancels and registers again on the same record', () => {
    const sent = rep.submit('tour-06', input(), requestId(), ME)
    const cancelled = rep.cancel(sent.id, sent.version, ME)
    expect(cancelled.state).toBe('Cancelled')
    expect(rep.listTours(ME).find((t) => t.id === 'tour-06')?.register.allowed).toBe(true)
    const again = rep.submit('tour-06', input(6), requestId(), ME)
    expect(again.id).toBe(sent.id)
    expect(again.state).toBe('Submitted')
  })

  it('locks everything once the Tour is Ready, and says why', () => {
    const locked = rep.listRegistrations(ME).find((r) => r.tourState === 'Ready')!
    expect(locked.allowedActions.cancel.allowed).toBe(false)
    expect(locked.participation).not.toBeNull()
    expect(error(() => rep.cancel(locked.id, locked.version, ME)).message).toMatch(/đã được chốt/)
  })

  it('refuses a save made on stale data', () => {
    const rejected = rep.listRegistrations(ME).find((r) => r.state === 'Rejected')!
    expect(error(() => rep.update(rejected.id, input(), rejected.version - 1, ME)).code).toBe('StaleData')
  })

  it('validates the form fields and the roster', () => {
    const body = error(() => rep.submit('tour-06', { ...input(0), contactEmail: 'khong-phai-email' }, requestId(), ME))
    expect(body.code).toBe('Validation')
    expect(body.fieldErrors?.contactEmail).toBeTruthy()
    expect(body.fieldErrors?.roster).toBeTruthy()
  })

  it('hides the join link once the Tour has ended', () => {
    const done = rep.listRegistrations(ME).find((r) => r.tourState === 'Completed')
    if (done) expect(done.participation).toBeNull()
  })
})
