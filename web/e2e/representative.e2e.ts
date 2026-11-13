import { expect, test, type Page } from '@playwright/test'
import { capturePage } from './support/capture'
import { mockApi } from './support/mock-api'
import { CANCELLED_REGISTRATION_ID, cancelledTour, OPEN_TOUR_ID, openTour, representativeHandlers, rosterXlsx } from './fixtures/representative'

const signIn = (page: Page) => mockApi(page, 'Representative', representativeHandlers())

test('representative: session list', async ({ page }) => {
  await signIn(page)
  await page.goto('/dai-dien/buoi')
  await expect(page.getByRole('heading', { level: 1, name: 'Buổi tham quan' })).toBeVisible()
  await expect(page.getByText(openTour.name).first()).toBeVisible()
  await capturePage(page, 'rep', 'sessions', { title: 'Buổi tham quan' })
})

test('representative: 3-step registration with Excel import', async ({ page }) => {
  const api = await signIn(page)
  await page.goto(`/dai-dien/buoi/${OPEN_TOUR_ID}/dang-ky`)

  // Step 1: school and group.
  await page.getByLabel('Tên trường').fill('THPT Lê Quý Đôn')
  await page.getByLabel('Tên đoàn').fill('Lớp 12A2')
  await page.getByLabel('Người liên hệ').fill('Phạm Thu Hà')
  await page.getByLabel('Email liên hệ').fill('thuha.pham@lqd.edu.vn')
  await capturePage(page, 'rep', 'register-step1', { title: 'Đăng ký tham quan' })
  await page.getByRole('button', { name: 'Tiếp tục' }).click()

  // Step 2: the invitation list from a generated .xlsx.
  await page.getByLabel('Chọn file Excel danh sách lời mời').setInputFiles({
    name: 'danh-sach-loi-moi.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: rosterXlsx(),
  })
  await expect(page.getByRole('button', { name: 'Xác nhận sử dụng danh sách này' })).toBeEnabled()
  await capturePage(page, 'rep', 'register-step2-preview', { title: 'Đăng ký tham quan' })
  await page.getByRole('button', { name: 'Xác nhận sử dụng danh sách này' }).click()
  await expect(page.getByRole('button', { name: 'Xác nhận sử dụng danh sách này' })).toBeHidden()
  await capturePage(page, 'rep', 'register-step2', { title: 'Đăng ký tham quan' })
  await page.getByRole('button', { name: 'Tiếp tục' }).click()

  // Step 3: review, consent, send.
  await expect(page.getByRole('checkbox')).toBeVisible()
  await capturePage(page, 'rep', 'register-step3', { title: 'Đăng ký tham quan' })
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Gửi đăng ký' }).click()
  await expect.poll(() => api.requests.filter((line) => line === `POST /api/representative/tours/${OPEN_TOUR_ID}/registrations`).length).toBe(1)
})

test('representative: cancelled-session profile', async ({ page }) => {
  await signIn(page)
  await page.goto(`/dai-dien/dang-ky/${CANCELLED_REGISTRATION_ID}`)
  await expect(page.getByText('Buổi tham quan đã bị huỷ')).toBeVisible()
  await capturePage(page, 'rep', 'cancelled-profile', { title: cancelledTour.name })
})
