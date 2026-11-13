import type { RegistrationSummary, RepresentativeRegistration, RepresentativeTour, RosterRow } from '../../src/features/representative/api/types'
import { rosterWorkbookBytes } from '../../src/features/representative/roster-import'
import { at, ok, paged, type Handler } from '../support/mock-api'

export const OPEN_TOUR_ID = '1b1b1b1b-0000-4000-8000-000000000001'
export const CANCELLED_TOUR_ID = '1b1b1b1b-0000-4000-8000-000000000002'
export const CANCELLED_REGISTRATION_ID = '2c2c2c2c-0000-4000-8000-000000000002'

const stops = [
  { order: 1, name: 'Sảnh chính', description: 'Nơi đón khách và quầy thông tin.' },
  { order: 2, name: 'Thư viện', description: 'Không gian đọc sách bốn tầng.' },
  { order: 3, name: 'Khu thực hành', description: 'Phòng lab robot và điện tử.' },
]

export const openTour: RepresentativeTour = {
  id: OPEN_TOUR_ID, name: 'Tham quan campus cho học sinh lớp 12', description: 'Robot dẫn đoàn qua thư viện và khu thực hành.',
  scheduledStartAt: at(5 * 24 * 60), state: 'SCHEDULED', rowVersion: 'rv-open', routeName: 'Tuyến Thư viện và Khu thực hành', stops,
  register: { allowed: true, reason: null }, cancelReason: null, capacity: 12, remainingSeats: 9, registrationClosesAt: at(4 * 24 * 60),
}
const secondTour: RepresentativeTour = {
  ...openTour, id: '1b1b1b1b-0000-4000-8000-000000000003', name: 'Tham quan buổi chiều thứ Năm', rowVersion: 'rv-2',
  scheduledStartAt: at(6 * 24 * 60 + 300), remainingSeats: 12, registrationClosesAt: at(5 * 24 * 60 + 300),
}
export const cancelledTour: RepresentativeTour = {
  ...openTour, id: CANCELLED_TOUR_ID, name: 'Tham quan Khu thực hành sáng thứ Hai', state: 'CANCELLED', rowVersion: 'rv-cancelled',
  scheduledStartAt: at(-2 * 24 * 60), register: { allowed: false, reason: 'Buổi tham quan đã huỷ.' },
  cancelReason: 'Robot cần bảo trì đột xuất.', remainingSeats: 0, registrationClosesAt: at(-3 * 24 * 60),
}

export const cancelledSummary: RegistrationSummary = {
  id: CANCELLED_REGISTRATION_ID, tourId: CANCELLED_TOUR_ID, tourName: cancelledTour.name, tourScheduledStartAt: cancelledTour.scheduledStartAt,
  tourState: 'CANCELLED', schoolName: 'THPT Lê Quý Đôn', groupName: 'Lớp 12A1', state: 'APPROVED', rowCount: 2,
  submittedAt: at(-6 * 24 * 60), updatedAt: at(-3 * 24 * 60), rejectionReason: null, reviewedAt: at(-5 * 24 * 60),
  tourCancelReason: cancelledTour.cancelReason, tourEndedAt: at(-3 * 24 * 60), tourRegistrationClosesAt: cancelledTour.registrationClosesAt,
}
export const cancelledRegistration: RepresentativeRegistration = {
  summary: cancelledSummary, contactName: 'Phạm Thu Hà', contactEmail: 'thuha.pham@lqd.edu.vn', rowVersion: 'rv-reg-c', tourRowVersion: 'rv-cancelled',
  rejectionReason: null, reviewedAt: at(-5 * 24 * 60),
  roster: [
    { id: 'c-1', rowNumber: 1, rowType: 'INDIVIDUAL', displayName: 'Lê Gia Huy', email: 'giahuy.le@student.lqd.edu.vn', className: '12A1', participationState: 'ACCEPTED', canRequestEmailChange: false, canRemove: false },
    { id: 'c-2', rowNumber: 2, rowType: 'SHARED_VIEWING', displayName: 'Phòng chiếu tầng 2', email: 'phongchieu@lqd.edu.vn', className: null, participationState: 'ACCEPTED', canRequestEmailChange: false, canRemove: false },
  ],
  allowedActions: {
    edit: { allowed: false, reason: 'Buổi tham quan đã huỷ.' }, resubmit: { allowed: false, reason: 'Buổi tham quan đã huỷ.' },
    cancel: { allowed: false, reason: 'Buổi tham quan đã huỷ.' },
  },
}

/** The roster the Excel import step uploads: two invitations and one shared projector room. */
export const importedRoster: RosterRow[] = [
  { rowNumber: 1, rowType: 'INDIVIDUAL', displayName: 'Nguyễn Thảo Vy', email: 'thaovy.nguyen@student.lqd.edu.vn', className: '12A2' },
  { rowNumber: 2, rowType: 'INDIVIDUAL', displayName: 'Trần Đức Minh', email: 'ducminh.tran@student.lqd.edu.vn', className: '12A2' },
  { rowNumber: 3, rowType: 'SHARED_VIEWING', displayName: 'Phòng chiếu tầng 3', email: 'phongchieu3@lqd.edu.vn', className: null },
]
/** A real .xlsx built by the app's own writer, so the test does not depend on a binary fixture in Git. */
export const rosterXlsx = () => Buffer.from(rosterWorkbookBytes(importedRoster))

const tours = [openTour, secondTour, cancelledTour]

export function representativeHandlers(): Handler[] {
  return [
    {
      method: 'GET', path: /^\/api\/representative\/tours(\?|$)/,
      reply: (_r, url) => ({ json: paged(url.searchParams.get('state') ? tours.filter((tour) => tour.state === url.searchParams.get('state')) : tours.filter((tour) => tour.state !== 'CANCELLED')) }),
    },
    {
      method: 'GET', path: /^\/api\/representative\/tours\/[^/?]+$/,
      reply: (_r, url) => {
        const tour = tours.find((item) => item.id === url.pathname.split('/').pop())
        return tour ? { json: ok(tour) } : { status: 404, json: { success: false, message: 'Not found', data: null, errors: null } }
      },
    },
    {
      method: 'GET', path: /^\/api\/representative\/registrations(\?|$)/,
      reply: (_r, url) => {
        const params = url.searchParams
        // No registration yet for the open Tour, so its form starts empty.
        if (params.get('tourId') && params.get('tourId') !== CANCELLED_TOUR_ID) return { json: paged([]) }
        if (params.get('group') === 'active') return { json: paged([]) }
        return { json: paged([cancelledSummary]) }
      },
    },
    { method: 'GET', path: `/api/representative/registrations/${CANCELLED_REGISTRATION_ID}`, reply: { json: ok(cancelledRegistration) } },
    { method: 'GET', path: `/api/representative/registrations/${CANCELLED_REGISTRATION_ID}/email-change-requests`, reply: { json: ok([]) } },
    { method: 'POST', path: `/api/representative/tours/${OPEN_TOUR_ID}/registrations`, reply: { json: ok({ id: '2c2c2c2c-0000-4000-8000-000000000009' }) } },
  ]
}
