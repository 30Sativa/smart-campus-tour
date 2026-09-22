import { beforeEach, describe, expect, it } from 'vitest'
import { listRegistrations, listTours } from '../../mocks/admin-sim'
import { resetSim } from '../../mocks/staff-sim'
import { adminCounts, buildAdminTasks } from './admin-attention'

describe('administration dashboard figures', () => {
  beforeEach(() => resetSim())

  it('counts pending reviews, Ready Tours and Tours still being prepared', () => {
    const counts = adminCounts(listTours())
    // tour-03 (1 waiting) + tour-07 (1 waiting)
    expect(counts.pending).toBe(2)
    expect(counts.ready).toBe(1)
    // tour-03, tour-06, tour-07 cannot be finalized yet; tour-05 can.
    expect(counts.needsPreparation).toBe(3)
  })

  it('puts reviews first, with a direct action, then Tours ready to finalize', () => {
    const tasks = buildAdminTasks(listTours(), listRegistrations({ state: 'Submitted' }))
    expect(tasks[0]).toMatchObject({ title: 'THPT Bùi Thị Xuân cập nhật danh sách, cần duyệt lại', actionLabel: 'Duyệt ngay' })
    expect(tasks.some((task) => task.id === 'final:tour-05' && task.actionLabel === 'Mở Tour')).toBe(true)
    expect(tasks.some((task) => task.id === 'mail:tour-03')).toBe(true)
  })
})
