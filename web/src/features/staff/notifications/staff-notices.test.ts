import { describe, expect, it } from 'vitest'
import type { StaffNotification } from './notifications-api'
import { toStaffNotice, toStaffNotices } from './staff-notices'

const row = (patch: Partial<StaffNotification>): StaffNotification => ({
  id: 1, occurredAt: '2026-11-10T08:00:00Z', action: 'POI_TECHNICAL_VERIFIED', resultCode: 'PASS', targetId: 'p-1',
  subject: 'Thư viện', revisionNumber: 2, robotCode: 'amr-01', actorName: 'Kỹ thuật A', ...patch,
})

describe('Technical Staff notices for Staff', () => {
  it('says a POI passed and opens that POI proposal', () => {
    expect(toStaffNotice(row({}))).toMatchObject({
      id: 'tech-1', tone: 'ok', title: 'POI "Thư viện" (bản 2) đã được duyệt', to: '/staff/manage/pois/p-1', toLabel: 'Mở POI',
    })
    expect(toStaffNotice(row({ action: 'POI_POSE_CAPTURE_VERIFIED' }))?.title).toBe('POI "Thư viện" (bản 2) đã được duyệt')
  })

  it('says a POI was sent back, with who checked it and on which robot', () => {
    const notice = toStaffNotice(row({ action: 'POI_TECHNICAL_REJECTED', resultCode: 'FAIL' }))
    expect(notice).toMatchObject({ tone: 'danger', title: 'POI "Thư viện" (bản 2) bị trả lại', toLabel: 'Xem lý do' })
    expect(notice?.detail).toMatch(/Kỹ thuật A kiểm tra không đạt trên robot amr-01/)
  })

  it('opens the Route for a test run, either way', () => {
    expect(toStaffNotice(row({ action: 'ROUTE_TEST_PASSED', targetId: 'r-1', subject: 'Tuyến A' })))
      .toMatchObject({ tone: 'ok', title: 'Tuyến "Tuyến A" (bản 2) chạy thử đạt', to: '/staff/manage/routes/r-1' })
    expect(toStaffNotice(row({ action: 'ROUTE_TEST_FAILED', targetId: 'r-1', subject: 'Tuyến A', resultCode: 'FAIL' })))
      .toMatchObject({ tone: 'danger', title: 'Tuyến "Tuyến A" (bản 2) chạy thử không đạt' })
  })

  it('reads a map check by its result', () => {
    const map = { action: 'MAP_DEPLOYMENT_CHECK_RECORDED', subject: 'campus_main', revisionNumber: 3 }
    expect(toStaffNotice(row({ ...map, resultCode: 'PASS' }))).toMatchObject({ tone: 'info', title: 'Bản đồ campus_main v3 đã sẵn sàng trên robot amr-01' })
    expect(toStaffNotice(row({ ...map, resultCode: 'FAIL' }))).toMatchObject({ tone: 'danger', title: 'Bản đồ campus_main v3 chưa đạt kiểm tra trên robot amr-01' })
  })

  it('says a held robot is back and opens the robot page', () => {
    expect(toStaffNotice(row({ action: 'ROBOT_INSPECTION_RELEASED', subject: 'amr-01', revisionNumber: null })))
      .toMatchObject({ tone: 'ok', title: 'Robot amr-01 đã kiểm tra xong', to: '/staff/robot' })
  })

  it('keeps a notice whose target is gone, without a link', () => {
    expect(toStaffNotice(row({ targetId: null, subject: null, revisionNumber: null })))
      .toMatchObject({ title: 'Một POI đã gửi đã được duyệt', to: null })
  })

  it('leaves out an action it cannot word instead of printing the code', () => {
    expect(toStaffNotices([row({ action: 'SOMETHING_NEW' }), row({ id: 2 })]).map(notice => notice.id)).toEqual(['tech-2'])
  })
})
