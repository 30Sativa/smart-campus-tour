import type { ReviewDetails, ReviewSummary, StaffEmailChange } from '../../src/features/administration/registrations/types'
import type { VersionedRoute } from '../../src/features/administration/routes/versioned-api'
import type { TourHeadStatus } from '../../src/features/staff/operations/live/head-control'
import type { StaffNotification } from '../../src/features/staff/notifications/notifications-api'
import type {
  TourDetails, TourOperator, TourRobotOption, TourShifts, TourStartChecks, TourSummary,
} from '../../src/features/administration/tours/types'
import type { RobotCameraStatus } from '../../src/features/quest-stream/camera-lease'
import type { FleetRobot } from '../../src/features/staff/operations/fleet-telemetry'
import { ACCOUNTS, at, NOW, ok, paged, type Handler } from '../support/mock-api'
import { MAP_ID, mapHandlers } from './map'

export const ME: TourOperator = { userId: ACCOUNTS.Staff.userId, fullName: 'Nguyễn Minh Anh', username: ACCOUNTS.Staff.username }
const OTHER: TourOperator = { userId: 'e2e-staff-2', fullName: 'Trần Quốc Bảo', username: 'bao.tran' }

export const ROBOT = 'AMR-01'
export const RUNNING_ID = '0a1b2c3d-0000-4000-8000-000000000001'
export const READY_ID = '0a1b2c3d-0000-4000-8000-000000000002'
export const SCHEDULED_ID = '0a1b2c3d-0000-4000-8000-000000000003'
export const QUICK_ID = '0a1b2c3d-0000-4000-8000-000000000004'
const ROUTE_ID = '5e5e5e5e-0000-4000-8000-000000000001'
const REVISION_ID = '5e5e5e5e-0000-4000-8000-0000000000a1'

export const route: VersionedRoute = {
  routeId: ROUTE_ID, revisionId: REVISION_ID, revisionNumber: 3, name: 'Tuyến Thư viện và Khu thực hành',
  description: 'Sảnh chính, Thư viện, Khu thực hành.', mapVersionId: MAP_ID, mapKey: 'campus-hcm', mapPackageSha256: 'a'.repeat(64),
  startX: 0, startY: 0, startYaw: 0, endMode: 'LAST_POI', endX: null, endY: null, endYaw: null,
  configurationFingerprint: 'f'.repeat(16), isSubmitted: true, verificationStatus: 'PASS', effectiveTestRunId: 'run-1',
  durationStatus: 'MEASURED', dwellDurationSeconds: 240,
  stops: [
    { id: 'stop-1', poiRevisionId: 'poi-r1', sourcePoiVerificationRecordId: 'v1', stopOrder: 1, dwellSeconds: 60, headSteps: [{ preset: 'FRONT', holdSeconds: 10 }], name: 'Sảnh chính', x: 2, y: 1, yaw: 0, cameraPreset: 'FRONT' },
    { id: 'stop-2', poiRevisionId: 'poi-r2', sourcePoiVerificationRecordId: 'v2', stopOrder: 2, dwellSeconds: 90, headSteps: [{ preset: 'LEFT', holdSeconds: 15 }], name: 'Thư viện', x: 8, y: 4, yaw: 1.57, cameraPreset: 'LEFT' },
    { id: 'stop-3', poiRevisionId: 'poi-r3', sourcePoiVerificationRecordId: 'v3', stopOrder: 3, dwellSeconds: 90, headSteps: [{ preset: 'RIGHT', holdSeconds: 15 }], name: 'Khu thực hành', x: 14, y: 2, yaw: 3.14, cameraPreset: 'RIGHT' },
  ],
  isActive: true, rowVersion: 'rv-route', scheduleFit: 'FITS', expectedDurationSeconds: 1500,
  testRuns: [{ id: 'run-1', routeRevisionId: REVISION_ID, robotCode: ROBOT, checkedByUserId: 'e2e-technical', participatingStaffUserId: ME.userId,
    resultCode: 'PASS', allStopsReached: true, safelyStopped: true, localizationPassed: true, measuredDurationSeconds: 1380,
    failureReason: null, evidenceNote: 'Chạy thử đủ 3 điểm.', checkedAt: at(-3 * 24 * 60), measurementBasis: 'FULL_RUN' }],
  revisionHistory: [], eligibilityIssues: [],
}

function summary(id: string, name: string, state: TourSummary['state'], startMinutes: number, extra: Partial<TourSummary> = {}): TourSummary {
  return {
    id, name, description: 'Tham quan từ xa cho học sinh lớp 12.', routeId: ROUTE_ID, routeName: route.name, activeRouteId: ROUTE_ID,
    scheduledStartAt: at(startMinutes), state, createdByUserId: ME.userId, createdAt: at(-7 * 24 * 60), updatedAt: at(-60),
    registrationClosesAt: at(startMinutes - 24 * 60), isShortNotice: false, rowVersion: `rv-${id}`,
    registrationCount: 2, invitationCount: 6, routeRevisionId: REVISION_ID, capacity: 12, heldSeats: 6,
    reservation: { robotCode: ROBOT, startsAt: at(startMinutes - 15), endsAt: at(startMinutes + 45), measuredDurationSeconds: 1380, expectedDurationSeconds: 1500, releasedAt: null },
    execution: null, operator: ME, readyBlockers: null, ...extra,
  }
}

export const runningTour = summary(RUNNING_ID, 'Tham quan Thư viện sáng thứ Sáu', 'RUNNING', -20, {
  execution: { operationalStatus: 'NORMAL', assistanceReason: null, currentStep: 'OBSERVING', commandState: 'ARRIVED', needsReconcile: false },
})
export const readyTour = summary(READY_ID, 'Tham quan Khu thực hành buổi chiều', 'READY', 300)
export const scheduledTour = summary(SCHEDULED_ID, 'Tham quan campus cho THPT Lê Quý Đôn', 'SCHEDULED', 4 * 24 * 60, {
  readyBlockers: [{ code: 'PENDING_REGISTRATIONS', message: 'Còn 1 đăng ký chờ duyệt.' }], operator: OTHER,
})
export const quickTour = summary(QUICK_ID, 'Tour nhanh đón đoàn khách', 'SCHEDULED', 90, {
  isShortNotice: true, registrationCount: 0, invitationCount: 0, heldSeats: 0, createdAt: NOW.toISOString(),
})
const allTours = [runningTour, readyTour, scheduledTour, quickTour]

function details(tour: TourSummary): TourDetails {
  const running = tour.state === 'RUNNING'
  const gate = (allowed: boolean, reason: string | null = null) => ({ allowed, reason, blockedBy: [] })
  return {
    tour, route: null, activeRoute: null, routeRevision: route, operator: tour.operator ?? null, reservation: tour.reservation ?? null,
    fallbackVideoUrl: null, startedAt: running ? at(-18) : null, endedAt: null, endReason: null,
    usage: { hasRegistrations: true, hasAllowedBranches: false, hasOperationalHistory: running, hasRobotOwnership: running },
    permissions: {
      canEditMetadata: !running, canChangeScheduleAndRoute: tour.state === 'SCHEDULED', canCancel: !running,
      canMarkReady: tour.state === 'SCHEDULED', canReopen: tour.state === 'READY', readyBlockers: tour.readyBlockers ?? [],
      canChangeCapacity: tour.state === 'SCHEDULED', canChangeOperator: !running, maxCapacity: 20,
    },
    execution: running ? {
      state: 'RUNNING', operationalStatus: 'NORMAL', assistanceReason: null, currentStep: 'OBSERVING',
      currentLegId: 'leg-2', currentLegKind: 'TO_POI', currentRevisionStopId: 'stop-2', lastArrivedRevisionStopId: 'stop-2',
      dwellDeadlineAt: at(1), command: { id: 'cmd-2', kind: 'GoTo', state: 'ARRIVED', outcome: 'ARRIVED', reasonCode: null },
    } : { state: tour.state, operationalStatus: null, assistanceReason: null, currentStep: null, currentLegId: null, currentLegKind: null,
      currentRevisionStopId: null, lastArrivedRevisionStopId: null, dwellDeadlineAt: null, command: null },
    allowedActions: {
      start: gate(tour.state === 'READY'), next: gate(running), endEarly: gate(running), retryLeg: gate(false, 'Chặng hiện tại chưa lỗi.'),
      reconcile: gate(false),
    },
  }
}

/** Server Start checks of the READY Tour: one blocker (robot not localized) so "Cần xử lý" has a row. */
export const startChecks: TourStartChecks = {
  checks: [
    ['tourReady', 'DB', 'Tour đã chốt.'], ['callerIsOperator', 'DB', 'Bạn là người vận hành của Tour.'],
    ['withinStartWindow', 'DB', 'Đang trong khung giờ.'], ['reservationActive', 'DB', 'Đang giữ robot AMR-01.'],
    ['noPendingDecisions', 'DB', 'Không còn dòng chờ duyệt.'], ['hasAcceptedRows', 'DB', '6 dòng đã duyệt.'],
    ['robotEligibleForRoute', 'DB', 'Robot dùng được cho tuyến.'], ['robotNotHeldByOtherTour', 'DB', 'Robot rảnh.'],
    ['telemetryFresh', 'TELEMETRY', 'Báo cách đây 2 giây.'], ['executionIdle', 'TELEMETRY', 'Robot đang rảnh.'],
    ['batteryInfo', 'TELEMETRY', 'Pin 76%.'], ['operatorConsoleConnected', 'CONSOLE', 'Trang điều hành đang mở.'],
    ['commandTransportEnabled', 'CONFIG', 'Kênh lệnh đang bật.'],
  ].map(([id, source, detail]) => ({ id, source, detail, passed: true }))
    .concat([{ id: 'robotLocalized', source: 'TELEMETRY', detail: 'Robot chưa định vị trên bản đồ.', passed: false }]),
  canStart: false, blockedBy: ['robotLocalized'], opensAt: at(270),
}

export const headStatus: TourHeadStatus = {
  enabled: true, mode: 'MANUAL', robotCode: ROBOT, connected: true, lastPollAt: at(0),
  head: { state: 'IDLE', referenced: true, panDeg: 0, tiltDeg: 0, observedAt: at(0) }, headReceivedAt: at(0),
}

export const cameraLease: RobotCameraStatus = {
  robotCode: ROBOT, wanted: true, reason: 'TOUR_RUNNING', robotListening: true, lastPollAt: at(0), leaseUntil: at(2),
  // The relay answers 503 in e2e, so the player shows its own connecting/unavailable state.
  stream: { whepUrl: 'http://api.e2e.invalid/relay/amr-01/whep', token: 'e2e-stream-token', expiresAt: at(5) },
}

/** One `FleetUpdated` broadcast: the robot at the Thư viện stop. */
export const fleet: FleetRobot[] = [{
  id: ROBOT, name: 'Robot số 1', connectionState: 'Live', batteryPercent: 76, lastSeenAt: at(0), telemetryAgeSeconds: 1, source: 'Physical',
  pose: { x: 8, y: 4, yaw: 1.57, capturedAt: at(0) }, poseAgeSeconds: 1, localized: true, motionReady: true, syncFresh: true, poseFresh: true,
  executionStatus: 'IDLE', mapKey: 'campus-hcm', frameId: 'map', legId: 'leg-2', faultCode: null, needsCheck: false,
}]

export const shifts: TourShifts = {
  days: Array.from({ length: 7 }, (_, index) => {
    const date = new Date(NOW.getTime() + (index - 4) * 24 * 3600_000).toISOString().slice(0, 10)
    return { date, shifts: [
      { code: 'MORNING', name: 'Ca sáng', startsAt: `${date}T01:00:00.000Z`, endsAt: `${date}T04:00:00.000Z`, tourStartsAt: `${date}T01:30:00.000Z`, time: '08:30', maxDurationSeconds: 7200, block: null },
      { code: 'AFTERNOON', name: 'Ca chiều', startsAt: `${date}T06:30:00.000Z`, endsAt: `${date}T09:30:00.000Z`, tourStartsAt: `${date}T07:00:00.000Z`, time: '14:00', maxDurationSeconds: 7200, block: null },
    ] }
  }),
  recommendedMaxSeconds: 3600, quickTourWaitMinutes: 90,
}

const REGISTRATION_ID = '9c9c9c9c-0000-4000-8000-000000000001'
export const pendingRegistration: ReviewSummary = {
  id: REGISTRATION_ID, tourId: SCHEDULED_ID, tourName: scheduledTour.name, tourScheduledStartAt: scheduledTour.scheduledStartAt, tourState: 'SCHEDULED',
  schoolName: 'THPT Lê Quý Đôn', groupName: 'Lớp 12A1', state: 'SUBMITTED', rowCount: 3,
  representativeName: 'Phạm Thu Hà', submittedAt: at(-26 * 60), updatedAt: at(-26 * 60),
}
export const registrationDetails: ReviewDetails = {
  summary: pendingRegistration, contactName: 'Phạm Thu Hà', contactEmail: 'thuha.pham@lqd.edu.vn', rowVersion: 'rv-reg', tourRowVersion: scheduledTour.rowVersion,
  rejectionReason: null, reviewedAt: null, reviewedByUserId: null,
  review: { allowed: true, reason: null }, correctEmail: { allowed: true, reason: null },
  roster: [
    { id: 'row-1', rowNumber: 1, rowType: 'INDIVIDUAL', displayName: 'Lê Gia Huy', email: 'giahuy.le@student.lqd.edu.vn', className: '12A1', participationState: 'PENDING', rowVersion: 'r1', invitationRowVersion: null, canApprove: true, canReject: true },
    { id: 'row-2', rowNumber: 2, rowType: 'INDIVIDUAL', displayName: 'Võ Ngọc Mai', email: 'ngocmai.vo@student.lqd.edu.vn', className: '12A1', participationState: 'ACCEPTED', rowVersion: 'r2', invitationRowVersion: 'i2', canApprove: false, canReject: true },
    { id: 'row-3', rowNumber: 3, rowType: 'SHARED_VIEWING', displayName: 'Phòng chiếu tầng 2', email: 'phongchieu@lqd.edu.vn', className: null, participationState: 'PENDING', rowVersion: 'r3', invitationRowVersion: null, canApprove: true, canReject: true },
  ],
}
export const emailChange: StaffEmailChange = {
  id: 'ec-1', registrationId: REGISTRATION_ID, rowId: 'row-2', rowNumber: 2, currentEmail: 'ngocmai.vo@student.lqd.edu.vn', proposedEmail: 'ngocmai.vo2008@gmail.com',
  state: 'PENDING', requestedByUserId: 'e2e-representative', createdAt: at(-90), reviewedAt: null, reviewedByUserId: null, reviewReason: null,
  rowVersion: 'ec-rv', tourRowVersion: scheduledTour.rowVersion, registrationRowVersion: 'rv-reg', rosterRowVersion: 'r2', canReview: true, expiresAt: at(22 * 60),
}

export const notifications: StaffNotification[] = [
  { id: 1, occurredAt: at(-45), action: 'ROUTE_VERIFICATION_RECORDED', resultCode: 'PASS', targetId: ROUTE_ID, subject: route.name, revisionNumber: 3, robotCode: ROBOT, actorName: 'Đỗ Kỹ Thuật' },
]

const robots: TourRobotOption[] = [
  { robotCode: ROBOT, displayName: 'Robot số 1', usable: true, blockReason: null },
  { robotCode: 'AMR-02', displayName: 'Robot số 2', usable: false, blockReason: 'Đang bảo trì.' },
]

function inRange(tour: TourSummary, url: URL) {
  const from = url.searchParams.get('from'); const to = url.searchParams.get('to')
  const time = Date.parse(tour.scheduledStartAt)
  return (!from || time >= Date.parse(from)) && (!to || time <= Date.parse(to))
}

const notFound = { status: 404, json: { success: false, message: 'Not found', data: null, errors: null } }

/** Staff API answers. `tours` filters list queries the way the server does, so every panel gets the rows it asks for. */
export function staffHandlers(): Handler[] {
  const listTours = (url: URL) => {
    const params = url.searchParams
    let rows = allTours.filter((tour) => inRange(tour, url))
    const phase = params.get('phase'); const state = params.get('state')
    if (phase === 'RUNNING') rows = rows.filter((tour) => tour.state === 'RUNNING')
    if (phase === 'FINISHED') rows = rows.filter((tour) => tour.state === 'COMPLETED' || tour.state === 'CANCELLED')
    if (phase === 'UPCOMING') rows = rows.filter((tour) => tour.state === 'SCHEDULED' || tour.state === 'READY')
    if (state) rows = rows.filter((tour) => tour.state === state)
    if (params.get('needsReconcile') === 'true') rows = rows.filter((tour) => tour.execution?.needsReconcile)
    return paged(rows, Number(params.get('page') ?? 1), Number(params.get('size') ?? 20))
  }
  return [
    { method: 'GET', path: /^\/api\/staff\/manage\/tours\?/, reply: (_r, url) => ({ json: listTours(url) }) },
    { method: 'GET', path: '/api/staff/manage/tours/operators', reply: { json: ok([ME, OTHER]) } },
    { method: 'GET', path: /^\/api\/staff\/manage\/tours\/robots\?/, reply: { json: ok(robots) } },
    { method: 'GET', path: /^\/api\/staff\/manage\/tours\/shifts\?/, reply: { json: ok(shifts) } },
    // The opening page asks `?holdAtStart=true` (ADR-0059); the path is matched with its query.
    { method: 'GET', path: /^\/api\/staff\/manage\/tours\/[^/]+\/start-checks(\?.*)?$/, reply: { json: ok(startChecks) } },
    { method: 'GET', path: /^\/api\/staff\/manage\/tours\/[^/]+\/head$/, reply: { json: ok(headStatus) } },
    { method: 'POST', path: /^\/api\/staff\/manage\/tours\/[^/]+\/head-commands$/, reply: { json: ok({ seq: 1, robotCode: ROBOT, issuedAt: NOW.toISOString() }) } },
    {
      method: 'GET', path: /^\/api\/staff\/manage\/tours\/[0-9a-f-]{36}$/,
      reply: (_r, url) => {
        const tour = allTours.find((item) => item.id === url.pathname.split('/').pop())
        return tour ? { json: ok(details(tour)) } : notFound
      },
    },
    { method: 'POST', path: '/api/staff/manage/tours', reply: { json: ok({ id: QUICK_ID }) } },
    { method: 'POST', path: /^\/api\/staff\/manage\/robots\/[^/]+\/camera-lease$/, reply: { json: ok(cameraLease) } },
    { method: 'GET', path: /^\/api\/staff\/manage\/robots\/[^/]+\/headset$/, reply: notFound },
    { method: 'GET', path: /^\/api\/staff\/notifications/, reply: { json: ok(notifications) } },
    {
      method: 'GET', path: /^\/api\/staff\/manage\/registrations\?/,
      reply: (_r, url) => ({ json: paged(url.searchParams.get('state') && url.searchParams.get('state') !== 'SUBMITTED' ? [] : [pendingRegistration]) }),
    },
    { method: 'GET', path: /^\/api\/staff\/manage\/registrations\/[^/?]+$/, reply: { json: ok(registrationDetails) } },
    { method: 'GET', path: /^\/api\/staff\/manage\/roster-email-change-requests/, reply: { json: ok([emailChange]) } },
    { method: 'GET', path: /^\/api\/staff\/poi-proposals/, reply: { json: ok([]) } },
    { method: 'GET', path: /^\/api\/routes\?/, reply: { json: paged([route]) } },
    { method: 'GET', path: /^\/api\/routes\/[^/]+\/revisions/, reply: { json: ok(route) } },
    { method: 'POST', path: /^\/relay\//, reply: { status: 503, body: 'no relay in e2e' } },
    ...mapHandlers,
  ]
}
