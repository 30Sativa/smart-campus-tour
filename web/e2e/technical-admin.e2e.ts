import { expect, test } from '@playwright/test'
import { capturePage } from './support/capture'
import { mockApi } from './support/mock-api'
import { technicalHandlers } from './fixtures/technical'
import { adminHandlers } from './fixtures/admin'

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
