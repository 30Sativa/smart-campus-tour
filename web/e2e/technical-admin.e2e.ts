import { expect, test } from '@playwright/test'
import { capturePage } from './support/capture'
import { at, mockApi, ok } from './support/mock-api'
import { robots, technicalHandlers } from './fixtures/technical'
import { adminHandlers } from './fixtures/admin'
import { MAP_ID, mapVersion } from './fixtures/map'
import type { MapVersionItem } from '../src/features/technical/api/technical'

test('technical: POI verification form starts with nothing ticked', async ({ page }) => {
  await mockApi(page, 'TechnicalStaff', technicalHandlers())
  await page.goto('/technical/pois')
  await expect(page.getByRole('heading', { level: 1, name: 'POI' })).toBeVisible()
  await capturePage(page, 'technical', 'poi-queue', { title: 'POI', technical: true })

  await page.getByRole('button', { name: 'Ghi kết quả' }).first().click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  const boxes = dialog.getByRole('checkbox')
  expect(await boxes.count(), 'POI form has its check boxes').toBeGreaterThan(0)
  for (const box of await boxes.all()) await expect(box, 'no check is ticked by default').not.toBeChecked()
  await capturePage(page, 'technical', 'poi-verify-form', { title: 'POI', technical: true })
})

// Round 2 W1: in Chrome a nested form's submit stops at the outer form, so "Tiếp tục" in the robot picker opened from
// the POI check reloaded /technical/pois instead of opening the robot setup. jsdom does not show that; Chromium does.
test('technical: assigning a robot from the POI check opens the robot setup with the POI map, and closing cleans the URL', async ({ page }) => {
  const unassigned = robots.map(robot => ({ ...robot, assignedMapVersionId: null, assignedAreaName: null, assignedVersionNumber: null, assignedMapKey: null, assignedFrameId: null, mapAssignedAt: null, mapAssignedByName: null, isDispatchEnabled: false,
    readiness: { state: 'NOT_SET_UP', reasonCode: 'ROBOT_MAP_NOT_ASSIGNED', reason: 'Robot AMR-01 chưa được gán bản đồ.', mapVersionId: null, mapLabel: null, deploymentCheckedAt: null, reportingOnAssignedMap: false } }))
  await mockApi(page, 'TechnicalStaff', [
    { method: 'GET', path: /^\/api\/technical\/physical-robots(\?|$)/, reply: { json: ok(unassigned) } },
    { method: 'GET', path: '/api/maps/versions', reply: { json: ok([{ ...mapVersion, runningRobot: null, currentlyDeployedOn: [] }]) } },
    { method: 'GET', path: '/api/technical/map-areas', reply: { json: ok([{ areaKey: 'campus-hcm', displayName: 'Campus Hồ Chí Minh' }]) } },
    ...technicalHandlers(),
  ])
  await page.goto('/technical/pois')
  await page.getByRole('button', { name: 'Ghi kết quả' }).first().click()
  await page.getByRole('button', { name: 'Gán robot cho bản đồ này' }).click()
  const picker = page.getByRole('dialog', { name: /^Gán .* cho robot$/ })
  await picker.getByLabel('Robot').selectOption('robot-1')
  await picker.getByRole('button', { name: 'Tiếp tục' }).click()

  // Round 3 W2: the robot page also carries the POI to come back to.
  await expect(page).toHaveURL(new RegExp(`/technical/robots\\?robot=robot-1&map=${MAP_ID}&returnTo=%2Ftechnical%2Fpois%3Fpoi%3D[^&]+$`))
  await expect(page.getByRole('note', { name: 'Quay lại' })).toContainText('Quay lại POI')
  const assignment = page.getByRole('dialog', { name: 'Bản đồ của AMR-01' })
  await expect(assignment.getByLabel('Phiên bản bản đồ')).toHaveValue(MAP_ID)
  await capturePage(page, 'technical', 'assign-from-poi-check', { title: 'Robot', technical: true })

  // W4: once the linked dialogs close, a reload must not reopen the map step.
  await assignment.getByRole('button', { name: 'Đóng' }).last().click()
  await expect(page).toHaveURL(/\/technical\/robots$/)
  await page.reload()
  await expect(page.getByRole('dialog', { name: 'Bản đồ của AMR-01' })).toHaveCount(0)
})

test('admin: audit log has no "Thao tác khác"', async ({ page }) => {
  await mockApi(page, 'Admin', adminHandlers())
  await page.goto('/admin/audit-logs')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByText('Nguyễn Minh Anh').first()).toBeVisible()
  await expect(page.getByText('Thao tác khác')).toHaveCount(0)
  await capturePage(page, 'admin', 'audit-log', { title: 'Nhật ký hệ thống' })
})

test('admin: reset password dialog', async ({ page }) => {
  await mockApi(page, 'Admin', adminHandlers())
  await page.goto('/admin/accounts')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await capturePage(page, 'admin', 'accounts', { title: 'Tài khoản' })
  await page.getByRole('button', { name: 'Sửa tài khoản staff.e2e' }).locator('visible=true').first().click()
  await page.getByRole('button', { name: 'Đặt lại mật khẩu' }).click()
  await expect(page.getByRole('dialog').filter({ hasText: 'Đặt lại mật khẩu?' })).toBeVisible()
  await capturePage(page, 'admin', 'reset-password', { title: 'Tài khoản' })
})

test('technical: map management splits in-use and retired versions, and retiring names what blocks it', async ({ page }) => {
  const floor = (id: string, areaKey: string, versionNumber: number, overrides: Partial<MapVersionItem['map']> = {}): MapVersionItem => ({
    ...mapVersion,
    map: { ...mapVersion.map, id, areaKey, areaName: 'Tầng 6', versionNumber, mapKey: `${areaKey}-v${versionNumber}`, status: 'ACTIVE', rowVersion: 'YWN0aXZl', ...overrides },
  })
  const maps = [
    { ...mapVersion, map: { ...mapVersion.map, status: 'ACTIVE' as const, rowVersion: 'YWN0aXZl' } },
    floor('floor-a-2', 'toa-a-tang-6', 2),
    floor('floor-b-1', 'toa-b-tang-6', 1),
    floor('floor-a-1', 'toa-a-tang-6', 1, { status: 'RETIRED', retiredAt: at(-3 * 24 * 60), retiredByName: 'Đỗ Kỹ Thuật', retirementReason: 'Quét lại sau khi sửa vách ngăn' }),
  ]
  await mockApi(page, 'TechnicalStaff', [
    { method: 'GET', path: '/api/maps/versions', reply: { json: ok(maps) } },
    { method: 'GET', path: `/api/technical/map-versions/${MAP_ID}/retirement-impact`, reply: { json: ok({
      mapVersionId: MAP_ID,
      routes: [{ routeId: 'route-1', name: 'Tuyến tham quan chính', isActive: true }],
      assignedRobots: [{ robotId: 'robot-1', robotCode: 'AMR-01' }],
      pendingPois: [{ proposalId: 'p-1', name: 'Thư viện', revisionNumber: 1 }],
      pendingRoutes: [],
      upcomingTours: [{ tourId: 'tour-1', name: 'Tour sáng thứ Hai', scheduledStartAt: at(3 * 24 * 60), state: 'SCHEDULED' }],
    }) } },
    ...technicalHandlers(),
  ])
  await page.goto('/technical/maps')
  await expect(page.getByRole('heading', { level: 1, name: 'Bản đồ' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Đang dùng' })).toHaveAttribute('aria-pressed', 'true')
  await capturePage(page, 'technical', 'maps-in-use', { title: 'Bản đồ', technical: true })

  await page.getByRole('button', { name: 'Xem chi tiết Campus Hồ Chí Minh · v2' }).click()
  await page.getByRole('button', { name: 'Ngừng sử dụng phiên bản này' }).click()
  const dialog = page.getByRole('dialog', { name: 'Ngừng sử dụng Campus Hồ Chí Minh · v2?' })
  await expect(dialog.getByRole('link', { name: 'AMR-01' })).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Ngừng sử dụng' })).toBeDisabled()
  await capturePage(page, 'technical', 'map-retire-blocked', { title: 'Bản đồ', technical: true })
  await dialog.getByRole('button', { name: 'Quay lại' }).click()

  await page.getByRole('button', { name: 'Ngừng sử dụng (1)' }).click()
  await expect(page.getByRole('region', { name: 'Phiên bản bản đồ ngừng sử dụng' })).toContainText('Quét lại sau khi sửa vách ngăn')
  await capturePage(page, 'technical', 'maps-retired', { title: 'Bản đồ', technical: true })
})
