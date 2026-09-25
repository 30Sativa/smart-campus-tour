import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router'
import StudentTourPage from '../../routes/student/StudentTourPage'
import { useStudentStore } from './student-store'

const clients: QueryClient[] = []

function renderStudentApp(initialPath = '/tour/tour-101') {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  })
  clients.push(client)

  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/tour/:tourId" element={<StudentTourPage />} />
          <Route path="/tour" element={<StudentTourPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  useStudentStore.getState().clearSession()
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  // Mock HTMLMediaElement play
  window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined)
  window.HTMLMediaElement.prototype.pause = vi.fn()
})

afterEach(() => {
  clients.splice(0).forEach((client) => client.clear())
  vi.restoreAllMocks()
})

describe('Student Tour workflow (Scope Mục 5 & UC-05)', () => {
  it('renders Join Form by default when no session exists', async () => {
    renderStudentApp('/tour/tour-101')

    expect(await screen.findByRole('heading', { level: 2, name: /Tham quan/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/Mã đoàn/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Họ và tên/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Vào buổi tham quan/i })).toBeInTheDocument()
  })

  it('rejects invalid student info with security error message', async () => {
    renderStudentApp('/tour/tour-101')

    fireEvent.change(screen.getByLabelText(/Mã đoàn/i), { target: { value: 'LHP2026' } })
    fireEvent.change(screen.getByLabelText(/Họ và tên/i), { target: { value: 'Tên Không Có Trong Roster' } })
    fireEvent.click(screen.getByRole('button', { name: /Vào buổi tham quan/i }))

    expect(
      await screen.findByText('Không thể xác nhận quyền tham gia. Vui lòng liên hệ đại diện.')
    ).toBeInTheDocument()
  })

  it('joins tour-101 (Running) and enters Live View with Video, 2D Map, and AI', async () => {
    renderStudentApp('/tour/tour-101')

    fireEvent.change(screen.getByLabelText(/Mã đoàn/i), { target: { value: 'LHP2026' } })
    fireEvent.change(screen.getByLabelText(/Họ và tên/i), { target: { value: 'Nguyễn Văn An' } })
    fireEvent.change(screen.getByLabelText(/Lớp học/i), { target: { value: '12A1' } })
    fireEvent.click(screen.getByRole('button', { name: /Vào buổi tham quan/i }))

    // Tour-101 is Running, so after match it enters Live Tour directly
    const studentNames = await screen.findAllByText(/Nguyễn Văn An/i)
    expect(studentNames.length).toBeGreaterThan(0)

    const statusElements = await screen.findAllByText(/Đang giới thiệu/i)
    expect(statusElements.length).toBeGreaterThan(0)

    expect(screen.getAllByText(/Thuyết minh điểm dừng/i)[0]).toBeInTheDocument()
    expect(screen.getAllByText(/Bản đồ 2D/i)[0]).toBeInTheDocument()
    expect(screen.getAllByText(/Trợ lý AI/i)[0]).toBeInTheDocument()
  })

  it('joins tour-102 (Scheduled) and enters Waiting Room with audio test', async () => {
    renderStudentApp('/tour/tour-102')

    fireEvent.change(screen.getByLabelText(/Mã đoàn/i), { target: { value: 'GD2026' } })
    fireEvent.change(screen.getByLabelText(/Họ và tên/i), { target: { value: 'Nguyễn Thị Hương' } })
    fireEvent.change(screen.getByLabelText(/Lớp học/i), { target: { value: '10C1' } })
    fireEvent.click(screen.getByRole('button', { name: /Vào buổi tham quan/i }))

    // Tour-102 is Scheduled, so it shows Waiting Room
    expect(await screen.findByText(/Đang chờ bắt đầu/i)).toBeInTheDocument()
    expect(screen.getByText(/Xin chào, Nguyễn Thị Hương!/i)).toBeInTheDocument()
    expect(screen.getByText(/Kiểm tra Loa \/ Âm thanh/i)).toBeInTheDocument()

    // Test audio click
    const testAudioBtn = screen.getByRole('button', { name: /Bấm để nghe thử âm thanh/i })
    fireEvent.click(testAudioBtn)
    await waitFor(() => {
      expect(screen.getByText(/Âm thanh sẵn sàng/i)).toBeInTheDocument()
    })
  })

  it('renders completed tour end screen with visited POIs', async () => {
    // Set a session for tour-103 which is Completed
    useStudentStore.getState().setSession({
      tourId: 'tour-103',
      groupCode: 'NTMK2026',
      studentName: 'Phan Bảo Trâm',
      studentClass: '12D1',
      sessionToken: 'token_123',
      joinedAt: new Date().toISOString(),
    })

    renderStudentApp('/tour/tour-103')

    expect(await screen.findByText(/Hoàn thành chuyến tham quan!/i)).toBeInTheDocument()
    expect(screen.getByText(/Các điểm tham quan trong lộ trình/i)).toBeInTheDocument()
  })
})
