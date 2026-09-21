import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readSheet } from 'read-excel-file/node'
import { resolve } from 'node:path'
import { remotePreviewApi as api, resetRemotePreview } from '../../mocks/remote-tour-mock'
import { useAuthStore } from '../../stores/auth-store'
import { hasOperationalRole, isRepresentativeRole } from '../../auth/roles'
import { parseRoster } from './roster'
import { studentStatus } from './remote-status'

function login(role = 'Representative', id = 'mock-user-representative') {
  useAuthStore.getState().setAuth('mock', { userId: id, username: 'demo', role })
}
async function tour(id = 'tour-1') { return (await api.workspace()).tours.find(t => t.id === id)! }
async function command(id: string, action: Parameters<typeof api.command>[2], reason = '') {
  return api.command(id, (await tour(id)).revision, action, true, reason)
}
beforeEach(() => { vi.useFakeTimers(); resetRemotePreview(); login() })
afterEach(() => { vi.useRealTimers(); useAuthStore.getState().logout() })

describe('remote scope access and registration', () => {
  it('separates Admin monitoring from Staff commands and rejects unknown identities', async () => {
    expect(hasOperationalRole('Admin')).toBe(false)
    expect(hasOperationalRole('TourOperator')).toBe(true)
    expect(isRepresentativeRole('superuser')).toBe(false)
    login('Admin')
    await expect(command('tour-3', 'hold')).rejects.toThrow('quyền')
  })
  it('keeps registrations visible in READY/RUNNING and isolates other representatives', async () => {
    const mine = await api.workspace()
    expect(mine.registrations.map(r => r.tourId)).toEqual(['tour-1', 'tour-2', 'tour-3'])
    expect(mine.robots).toEqual([])
    login('Representative', 'other')
    expect((await api.workspace()).registrations).toEqual([])
    await expect(api.registrationAction('reg-1', 1, 'cancel')).rejects.toThrow('quyền')
  })
  it('retains a waiting browser through roster edits and revalidates after approval', async () => {
    await api.join('tour-1', 'DEMO-1', 'nguyen van an', '12a1')
    expect((await api.student('tour-1')).access).toBe('waiting')
    const r = (await api.workspace()).registrations[0]
    await api.saveRegistration({ ...r, roster: [...r.roster, { name: 'Đặng Thị Hà', className: '' }] }, r.revision)
    expect((await api.student('tour-1')).access).toBe('updating')
    await expect(api.join('tour-1', 'DEMO-1', 'dang thi ha', '')).rejects.toThrow('Không thể xác nhận')
    login('Admin'); await api.registrationAction('reg-1', 2, 'approve')
    expect((await api.student('tour-1')).access).toBe('waiting')
    await api.join('tour-1', 'DEMO-1', 'dang thi ha', '')
    expect((await api.student('tour-1')).access).toBe('waiting')
  })
  it('never exposes rejection reason or roster to Student; REJECTED can be cancelled', async () => {
    await api.join('tour-1', 'DEMO-1', 'Nguyễn Văn An', '12A1')
    const r = (await api.workspace()).registrations[0]
    await api.saveRegistration(r, r.revision)
    login('Admin'); await api.registrationAction('reg-1', 2, 'reject', 'Private admin reason')
    const s = await api.student('tour-1')
    expect(JSON.stringify(s)).not.toContain('Private admin reason')
    expect(s).not.toHaveProperty('roster')
    expect(s.access).not.toBe('live')
    login(); await api.registrationAction('reg-1', 3, 'cancel')
    expect((await api.workspace()).registrations[0].state).toBe('CANCELLED')
  })
  it('rejects stale approval and blocks READY until all submissions are handled', async () => {
    const r = (await api.workspace()).registrations[0]
    await api.saveRegistration(r, r.revision)
    login('Admin')
    await expect(api.registrationAction(r.id, r.revision, 'approve')).rejects.toThrow('Dữ liệu đã thay đổi')
    await expect(command('tour-1', 'ready')).rejects.toThrow('chờ duyệt')
    await api.registrationAction(r.id, 2, 'approve')
    await command('tour-1', 'ready')
    expect((await tour()).state).toBe('READY')
    login(); await expect(api.saveRegistration(r, 3)).rejects.toThrow('khóa')
  })
  it('joins RUNNING directly, checks class and expires browser access', async () => {
    await expect(api.join('tour-3', 'DEMO-1', 'Nguyễn Văn An', '12A1')).rejects.toThrow()
    await expect(api.join('tour-3', 'DEMO-3', 'Nguyễn Văn An', '')).rejects.toThrow()
    await api.join('tour-3', 'DEMO-3', 'nguyen van an', '12a1')
    expect((await api.student('tour-3')).access).toBe('live')
    vi.advanceTimersByTime(2 * 60 * 60 * 1000 + 1)
    expect((await api.student('tour-3')).access).toBe('join')
  })
})

describe('operations and terminal flow', () => {
  it('Hold prevents automatic Next and is unavailable during navigation', async () => {
    login('Staff')
    await command('tour-3', 'hold'); vi.advanceTimersByTime(20000)
    expect((await tour('tour-3')).step).toBe('OBSERVING')
    await command('tour-3', 'next')
    expect((await tour('tour-3')).step).toBe('FRONT')
    vi.advanceTimersByTime(8001)
    expect((await tour('tour-3')).step).toBe('NAVIGATING')
    await expect(command('tour-3', 'hold')).rejects.toThrow('đã dừng')
  })
  it('retains robot after End Early and releases only after confirmation', async () => {
    await api.join('tour-3', 'DEMO-3', 'Nguyễn Văn An', '12A1')
    login('Staff'); await command('tour-3', 'end-early', 'Kiểm tra thiết bị')
    expect((await api.student('tour-3')).access).toBe('ended')
    await expect(api.ask('tour-3', 0, 'Hỏi')).rejects.toThrow()
    expect((await api.workspace()).robots[0].assignedTourId).toBe('tour-3')
    await expect(command('tour-2', 'start')).rejects.toThrow('Robot')
    await expect(api.releaseRobot(false)).rejects.toThrow('xác nhận')
    await api.releaseRobot(true); await command('tour-2', 'start')
    expect((await tour('tour-2')).state).toBe('RUNNING')
  })
  it('restart cannot be resumed by a hidden retry action', async () => {
    login('Staff'); await api.simulateFault('tour-3', 'restart')
    expect((await api.workspace()).actions['tour-3'].filter(a => !a.reason).map(a => a.action)).toEqual(['end-early'])
    await expect(command('tour-3', 'retry-poi')).rejects.toThrow()
  })
  it('assistance retains private AI and exposes step-specific recovery', async () => {
    await api.join('tour-3', 'DEMO-3', 'Nguyễn Văn An', '12A1')
    login('Staff'); await api.simulateFault('tour-3', 'fault')
    expect(studentStatus(await api.student('tour-3'))).toContain('Tạm gián đoạn')
    expect((await api.ask('tour-3', 0, 'Sảnh là gì?')).poi).toBe('Sảnh đón tiếp')
    await expect(command('tour-3', 'next')).rejects.toThrow('sự cố')
    await command('tour-3', 'retry-poi')
    expect((await tour('tour-3')).step).toBe('PREPARING')
  })
  it('requires return-to-endpoint before automatic completion', async () => {
    login('Staff')
    let t = await tour('tour-3')
    for (let i = 0; i < 20 && t.step !== 'RETURNING'; i++) { vi.advanceTimersByTime(8001); t = await tour('tour-3') }
    expect(t.step).toBe('RETURNING'); expect(t.state).toBe('RUNNING')
    vi.advanceTimersByTime(8001)
    expect((await tour('tour-3')).state).toBe('COMPLETED')
    expect((await api.workspace()).robots[0].assignedTourId).toBeNull()
  })
})

describe('Excel roster', () => {
  it('reads the downloadable xlsx template', async () => {
    vi.useRealTimers()
    expect(parseRoster(await readSheet(resolve('public/templates/roster.xlsx'), 1))).toEqual([{ name: 'Nguyễn Văn An', className: '12A1' }])
  })
  it('reports row errors, preserves duplicates and accepts optional class', () => {
    expect(() => parseRoster([['HoTen'], ['An'], [null, '12A1']])).toThrow('Dòng 3')
    expect(parseRoster([['HoTen'], ['An'], [], ['An']])).toHaveLength(2)
    expect(() => parseRoster([['Name'], ['An']])).toThrow('HoTen')
  })
})
