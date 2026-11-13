import { expect, test } from '@playwright/test'
import { capturePage } from './support/capture'
import { mockApi } from './support/mock-api'
import { hangingSessionHandlers, runningHandlers, STUDENT_TOUR_ID, wrongCodeHandlers } from './fixtures/student'

test('public home', async ({ page }) => {
  await mockApi(page, null, [])
  await page.goto('/')
  await expect(page.locator('h1').first()).toBeVisible()
  await capturePage(page, 'public', 'home', { title: 'Trang chủ', scrollThrough: true })
})

test('404 page', async ({ page }) => {
  await mockApi(page, null, [])
  await page.goto('/khong-co-trang-nay')
  await expect(page.getByRole('heading', { name: 'Không tìm thấy trang' })).toBeVisible()
  await capturePage(page, 'public', '404', { title: 'Không tìm thấy trang' })
})

test('student tour: wrong access code', async ({ page }) => {
  await mockApi(page, null, wrongCodeHandlers)
  await page.goto(`/tour/${STUDENT_TOUR_ID}`)
  await page.locator('#invitation-code').fill('SAI-MA-123')
  await page.getByRole('button', { name: 'Vào Tour' }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'Mã truy cập không hợp lệ' })).toBeVisible()
  await capturePage(page, 'student', 'wrong-code', { title: 'Tham gia Tour được mời' })
})

test('student tour: hanging session check offers Thử lại', async ({ page }) => {
  await mockApi(page, null, hangingSessionHandlers)
  await page.goto(`/tour/${STUDENT_TOUR_ID}`)
  await expect(page.getByText('Đang kiểm tra phiên')).toBeVisible()
  // The watchdog is 8 s (SESSION_CHECK_WATCHDOG_MS); move the page clock past it.
  await page.clock.runFor(8_500)
  await expect(page.getByText('Chưa kiểm tra được phiên')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Thử lại' })).toBeVisible()
  await capturePage(page, 'student', 'session-retry', { title: 'Tham gia Tour được mời' })
})

test('student tour: RUNNING with video, map and AI', async ({ page }) => {
  await mockApi(page, null, runningHandlers)
  await page.goto(`/tour/${STUDENT_TOUR_ID}`)
  await expect(page.locator('video').first()).toBeAttached()
  await expect(page.getByRole('heading', { name: 'Thư viện' }).first()).toBeVisible()
  await capturePage(page, 'student', 'live', { title: 'Tham quan Thư viện và Khu thực hành' })

  await page.getByRole('tab', { name: 'Hỏi AI' }).click()
  await page.getByLabel('Câu hỏi cho Trợ lý AI').fill('Robot dùng cảm biến gì?')
  await page.getByRole('button', { name: 'Gửi câu hỏi' }).click()
  await expect(page.getByText('Robot dùng cảm biến LiDAR')).toBeVisible()
  await capturePage(page, 'student', 'live-ai', { title: 'Tham quan Thư viện và Khu thực hành' })
})

// Owner decision outside this batch: the invited Student page hides the 2D map tab (StudentInvitationPage passes
// showMap={false}) until a robot pose feed exists. Kept as a visible fixme, not as a passing check, so the gap stays listed.
test.fixme('student tour: RUNNING shows the "Bản đồ 2D" tab', () => {})
