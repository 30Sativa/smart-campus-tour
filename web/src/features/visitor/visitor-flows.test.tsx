import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router'
import { remotePreviewApi, resetRemotePreview } from '../../mocks/remote-tour-mock'
import { useAuthStore } from '../../stores/auth-store'
import { mockVisitorApi } from '../../mocks/visitor-mock'
import VisitorShell from './VisitorShell'
import VisitorHomePage from '../../routes/visitor/VisitorHomePage'
import ExplorePage from '../../routes/visitor/ExplorePage'
import CampusMapPage from '../../routes/visitor/CampusMapPage'
import LocationDetailPage from '../../routes/visitor/LocationDetailPage'
import BookRobotPage from '../../routes/visitor/BookRobotPage'
import MyBookingsPage from '../../routes/visitor/MyBookingsPage'
import MyToursPage from '../../routes/visitor/MyToursPage'
import ActiveTourPage from '../../routes/visitor/ActiveTourPage'
import AskRobotPage from '../../routes/visitor/AskRobotPage'
import NotificationsPage from '../../routes/visitor/NotificationsPage'
import ProfilePage from '../../routes/visitor/ProfilePage'

vi.mock('../../mocks/mock-mode', () => ({ USE_MOCK_API: true, mockDelay: <T,>(value: T) => Promise.resolve(value) }))

const clients: QueryClient[] = []
function visit(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } })
  clients.push(client)
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/visit" element={<VisitorShell />}>
      <Route index element={<VisitorHomePage />} />
      <Route path="explore" element={<ExplorePage />} />
      <Route path="explore/:locationId" element={<LocationDetailPage />} />
      <Route path="map" element={<CampusMapPage />} />
      <Route path="book" element={<BookRobotPage />} />
      <Route path="bookings" element={<MyBookingsPage />} />
      <Route path="tours" element={<MyToursPage />} />
      <Route path="tour" element={<ActiveTourPage />} />
      <Route path="assistant" element={<AskRobotPage />} />
      <Route path="notifications" element={<NotificationsPage />} />
      <Route path="profile" element={<ProfilePage />} />
    </Route>
  </Routes></MemoryRouter></QueryClientProvider>)
}

beforeEach(() => {
  resetRemotePreview()
  useAuthStore.getState().setAuth('mock', { userId: 'mock-user-representative', username: 'demo', role: 'Representative' })
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  // jsdom has no layout or native modal implementation. These model open/close;
  // browser focus trapping and visual layout still require a browser check.
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() })
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value() { this.setAttribute('open', '') } })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value() { this.removeAttribute('open') } })
})
afterEach(() => { useAuthStore.getState().logout(); clients.splice(0).forEach((client) => client.clear()); vi.restoreAllMocks() })

describe('visitor journeys', () => {
  it('follows Home → Explore → Map → location and opens scheduled tours without a custom destination', async () => {
    visit('/visit')
    fireEvent.click((await screen.findAllByRole('link', { name: 'Explore campus' }))[0])
    expect(await screen.findByRole('heading', { level: 1, name: 'Explore campus' })).toHaveFocus()
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Central Library' } })
    const place = await screen.findByRole('heading', { name: 'Central Library' })
    const card = place.closest('article')!
    fireEvent.click(within(card).getByRole('link', { name: 'Directions' }))
    // Selection must work even on devices without WebGL or before model anchors
    // have been surveyed. The location list remains the accessible alternative.
    expect(await screen.findByRole('button', { name: /Central Library.*Delta Building/ })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('link', { name: 'View details' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Central Library' })).toHaveFocus()
    expect(screen.getByRole('link', { name: 'View available tours' })).toHaveAttribute('href', '/visit/book')
  })

  it('recovers an empty search by clearing filters', async () => {
    visit('/visit/explore')
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'no-such-campus-place' } })
    expect(await screen.findByText('Nothing matches that yet')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(await screen.findByRole('heading', { name: 'Central Library' })).toBeVisible()
  })

  it('requires an available slot and shows the actual booking confirmation', async () => {
    const fixture = (await mockVisitorApi.bookings())[0]
    vi.spyOn(mockVisitorApi, 'slots').mockResolvedValue([{ time: '09:00', available: false, robotsFree: 0 }, { time: '10:00', available: true, robotsFree: 2 }])
    const create = vi.spyOn(mockVisitorApi, 'createBooking').mockImplementation(async (input) => ({ ...fixture, ...input, reference: 'CT-TEST', status: 'Confirmed' }))
    visit('/visit/book')
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByRole('button', { name: /09:00/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: /10:00/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.getByRole('heading', { name: 'Check your booking' })).toHaveFocus()
    expect(create).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm booking' }))
    expect(await screen.findByRole('heading', { name: 'Your booking is confirmed' })).toBeVisible()
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ time: '10:00', tourType: 'CampusTour', destinationIds: [] }))
    expect(screen.getByText('Booking CT-TEST')).toBeVisible()
    fireEvent.click(screen.getByRole('link', { name: 'Manage my bookings' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'My bookings' })).toBeVisible()
  })

  it('shows an alternative date action when no robots are available', async () => {
    vi.spyOn(mockVisitorApi, 'slots').mockResolvedValue([])
    visit('/visit/book')
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByText('No robots available on this date')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Choose another date' }))
    expect(screen.getByRole('heading', { name: 'Choose a date' })).toHaveFocus()
  })

  it('never cancels before confirmation and supports keyboard tabs', async () => {
    const bookings = await mockVisitorApi.bookings()
    const booking = bookings.find((item) => item.status === 'Confirmed')!
    const cancel = vi.spyOn(mockVisitorApi, 'cancelBooking').mockResolvedValue({ ...booking, status: 'Cancelled' })
    visit('/visit/bookings')
    fireEvent.click((await screen.findAllByRole('button', { name: 'Cancel booking' }))[0])
    const dialog = screen.getByRole('dialog', { name: 'Cancel this booking?' })
    expect(cancel).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Go back' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: 'Cancel booking' })[0])
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel booking' }))
    expect(await screen.findByText(/was cancelled\./)).toBeVisible()
    expect(cancel).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(screen.getByRole('tab', { name: /Upcoming/ }), { key: 'End' })
    expect(screen.getByRole('tab', { name: /Cancelled/ })).toHaveFocus()
    expect(screen.getByRole('tabpanel')).toHaveAccessibleName(/Cancelled/)
  })

  it('confirms tour commands and opens the assistant from an active tour', async () => {
    const active = (await mockVisitorApi.activeTour())!
    const command = vi.spyOn(mockVisitorApi, 'commandTour').mockResolvedValue({ ...active, robotState: 'Paused' })
    visit('/visit/tour')
    fireEvent.click(await screen.findByRole('button', { name: 'Pause tour' }))
    expect(command).not.toHaveBeenCalled()
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Pause tour' }))
    await waitFor(() => expect(command).toHaveBeenCalledWith(active.sessionId, 'pause'))
    expect(await screen.findByText('Tour paused. Resume when you are ready.')).toBeVisible()
    fireEvent.click(within(screen.getByRole('main')).getByRole('link', { name: 'Ask the robot' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Campus assistant' })).toBeVisible()
  })

  it('turns an assistant answer into actionable location links', async () => {
    visit('/visit/assistant')
    fireEvent.change(screen.getByRole('textbox', { name: 'Ask about the campus' }), { target: { value: 'Where is the library?' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    const location = await screen.findByRole('heading', { name: 'Central Library' })
    expect(within(location.closest('article')!).getByRole('link', { name: 'Show on map' })).toHaveAttribute('href', '/visit/map?destination=loc-library')
    expect(screen.getByRole('log')).toHaveTextContent('Where is the library?')
    expect(screen.getByRole('textbox')).toHaveValue('')
  })

  it('preserves unsaved profile edits when a notification preference changes', async () => {
    let profile = await mockVisitorApi.profile()
    const update = vi.spyOn(mockVisitorApi, 'updateProfile').mockImplementation(async (input) => { profile = { ...profile, ...input }; return profile })
    visit('/visit/profile')
    const name = await screen.findByRole('textbox', { name: 'Full name' })
    await waitFor(() => expect(name).toHaveValue(profile.fullName))
    fireEvent.change(name, { target: { value: 'Campus Visitor' } })
    fireEvent.click(screen.getByRole('switch', { name: /Campus news/ }))
    await waitFor(() => expect(screen.getByRole('switch', { name: /Campus news/ })).toHaveAttribute('aria-checked', 'true'))
    expect(name).toHaveValue('Campus Visitor')
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ fullName: 'Campus Visitor' })))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled())
  })

  it('marks unread notifications as read and keeps history accessible', async () => {
    const notifications = await remotePreviewApi.notifications()
    visit('/visit/notifications')
    fireEvent.click(await screen.findByRole('button', { name: 'Mark all as read' }))
    await screen.findByText('All caught up. Your notifications are marked as read.')
    fireEvent.click(screen.getByRole('button', { name: 'Unread · 0' }))
    expect(screen.getByText('You are all caught up')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'All updates' }))
    expect(screen.getByText(notifications[0].title)).toBeVisible()
  })

  it('closes account navigation with Escape and restores its trigger', async () => {
    visit('/visit/tours')
    await screen.findByRole('heading', { level: 1, name: 'My tours' })
    const trigger = screen.getByRole('button', { name: 'Account menu' })
    fireEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(trigger).toHaveFocus()
  })
})
