import { expect, test, type Page } from '@playwright/test'
import { capturePage } from './support/capture'
import { mockApi } from './support/mock-api'
import { fleet, QUICK_ID, READY_ID, RUNNING_ID, staffHandlers } from './fixtures/staff'

const signIn = (page: Page) => mockApi(page, 'Staff', staffHandlers(), { fleet })
const heading = (page: Page, name: string) => expect(page.getByRole('heading', { level: 1, name })).toBeVisible()

test('staff: overview', async ({ page }) => {
  await signIn(page)
  await page.goto('/staff')
  await heading(page, 'Tổng quan')
  await capturePage(page, 'staff', 'overview', { title: 'Tổng quan' })
})

test('staff: schedule', async ({ page }) => {
  await signIn(page)
  await page.goto('/staff/schedule')
  await heading(page, 'Lịch Tour')
  await capturePage(page, 'staff', 'schedule', { title: 'Lịch Tour' })
})

test('staff: quick Tour create, then "Gửi cho đại diện"', async ({ page }) => {
  const api = await signIn(page)
  await page.goto('/staff/manage/tours/new?kind=quick')
  await heading(page, 'Tạo Tour')
  await page.getByLabel('Tên Tour').fill('Tour nhanh đón đoàn khách')
  await page.getByLabel('Lý do tạo gấp').fill('Đoàn khách của nhà trường tới sớm hơn dự kiến.')
  await page.getByLabel('Tuyến đã kiểm chứng').selectOption({ index: 1 })
  await expect(page.getByLabel('Robot')).toBeEnabled()
  await page.getByLabel('Robot').selectOption('AMR-01')
  await capturePage(page, 'staff', 'quick-tour-form', { title: 'Tạo Tour' })

  await page.getByRole('button', { name: 'Tạo Tour' }).click()
  await expect(page).toHaveURL(new RegExp(`/staff/manage/tours/${QUICK_ID}$`))
  expect(api.requests.some((line) => line === 'POST /api/staff/manage/tours')).toBe(true)
  await expect(page.getByRole('heading', { name: 'Gửi cho đại diện' })).toBeVisible()
  await capturePage(page, 'staff', 'quick-tour-share', { title: 'Tour nhanh đón đoàn khách' })
})

test('staff: start check', async ({ page }) => {
  await signIn(page)
  await page.goto(`/staff/tours/${READY_ID}/start`)
  await expect(page.getByRole('button', { name: /Bắt đầu Tour/ })).toBeVisible()
  // Brief WS-0 item 3: the start check page names itself, not the Tour.
  await capturePage(page, 'staff', 'start-check', { title: 'Kiểm tra trước khi bắt đầu' })
})

test('staff: live console while RUNNING', async ({ page }) => {
  const api = await signIn(page)
  await page.goto(`/staff/live/${RUNNING_ID}`)
  await expect(page.getByRole('region', { name: 'Camera', exact: true })).toBeVisible()
  await expect(page.locator('section[aria-label="Camera"] video')).toBeAttached()
  const head = page.getByRole('group', { name: 'Nút xoay đầu camera' })
  await expect(head.getByRole('button').first()).toBeEnabled()
  await expect(page.getByRole('region', { name: 'Kết thúc sớm' })).toBeVisible()
  await capturePage(page, 'staff', 'live', { title: 'Tham quan Thư viện sáng thứ Sáu' })

  await head.getByRole('button').first().click()
  await expect.poll(() => api.requests.filter((line) => line.endsWith('/head-commands')).length).toBeGreaterThan(0)

  await page.getByRole('button', { name: 'Kết thúc sớm Tour' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await capturePage(page, 'staff', 'live-end-early', { title: 'Tham quan Thư viện sáng thứ Sáu' })
})

test('staff: registration row review and email-change review', async ({ page }) => {
  await signIn(page)
  await page.goto('/staff/manage/registrations/pending')
  await heading(page, 'Đăng ký đoàn')
  await capturePage(page, 'staff', 'registrations', { title: 'Đăng ký đoàn' })

  await page.getByRole('button', { name: /Xem & duyệt/ }).first().click()
  await expect(page.getByRole('region', { name: 'Yêu cầu đổi email chờ duyệt' })).toBeVisible()
  await capturePage(page, 'staff', 'registration-review', { title: 'Đăng ký đoàn' })

  await page.getByRole('button', { name: 'Chấp nhận Lê Gia Huy' }).click()
  await expect(page.getByRole('dialog').last()).toBeVisible()
  await capturePage(page, 'staff', 'registration-row-confirm', { title: 'Đăng ký đoàn' })
  await page.getByRole('dialog').last().getByRole('button', { name: 'Quay lại' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(1)

  // The drawer re-renders on its own refresh, so the button is never "stable" for long; skip that wait.
  await page.getByRole('button', { name: 'Duyệt đổi email dòng 2' }).click({ force: true })
  await expect(page.getByRole('dialog').last()).toBeVisible()
  await capturePage(page, 'staff', 'email-change-review', { title: 'Đăng ký đoàn' })
})
