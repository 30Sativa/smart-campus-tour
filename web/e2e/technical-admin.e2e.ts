import { expect, test } from '@playwright/test'
import { capturePage } from './support/capture'
import { at, mockApi, ok } from './support/mock-api'
import { technicalHandlers } from './fixtures/technical'
import { adminHandlers } from './fixtures/admin'
import { MAP_ID, mapVersion } from './fixtures/map'
import type { MapVersionItem } from '../src/features/technical/api/technical'

test('technical: POI verification form starts with nothing ticked', async ({ page }) => {
  await mockApi(page, 'TechnicalStaff', technicalHandlers())
  await page.goto('/technical/poi-import')
  await expect(page.getByRole('heading', { level: 1, name: 'Kiểm chứng POI' })).toBeVisible()
  await capturePage(page, 'technical', 'poi-queue', { title: 'Kiểm chứng POI', technical: true })

  await page.getByRole('button', { name: 'Ghi kết quả' }).first().click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  const boxes = dialog.getByRole('checkbox')
  expect(await boxes.count(), 'POI form has its check boxes').toBeGreaterThan(0)
  for (const box of await boxes.all()) await expect(box, 'no check is ticked by default').not.toBeChecked()
  await capturePage(page, 'technical', 'poi-verify-form', { title: 'Kiểm chứng POI', technical: true })
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

  await page.getByRole('button', { name: 'Xem chi tiết Campus Hồ Chí Minh · campus-hcm · phiên bản 2' }).click()
  await page.getByRole('button', { name: 'Ngừng sử dụng phiên bản này' }).click()
  const dialog = page.getByRole('dialog', { name: 'Ngừng sử dụng Campus Hồ Chí Minh · campus-hcm · phiên bản 2?' })
  await expect(dialog.getByRole('link', { name: 'AMR-01' })).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Ngừng sử dụng' })).toBeDisabled()
  await capturePage(page, 'technical', 'map-retire-blocked', { title: 'Bản đồ', technical: true })
  await dialog.getByRole('button', { name: 'Quay lại' }).click()

  await page.getByRole('button', { name: 'Ngừng sử dụng (1)' }).click()
  await expect(page.getByRole('region', { name: 'Phiên bản bản đồ ngừng sử dụng' })).toContainText('Quét lại sau khi sửa vách ngăn')
  await capturePage(page, 'technical', 'maps-retired', { title: 'Bản đồ', technical: true })
})
