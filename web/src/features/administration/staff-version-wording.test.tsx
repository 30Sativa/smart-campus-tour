import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import StaffManageRouteCatalogPage from '../../routes/staff/manage/StaffManageRouteCatalogPage'
import StaffManageRouteDetailsPage from '../../routes/staff/manage/StaffManageRouteDetailsPage'
import type { MapVersionItem } from '../technical/api/technical'
import { staffMapLabels } from './map-labels'
import { staffRouteStatus } from './routes/route-messages'

const mapItem = (id: string, versionNumber: number, usable = true) => ({
  map: { id, areaKey: 'tang-6', areaName: 'Tầng 6', versionNumber, mapKey: `tang-6-v${versionNumber}`, uploadedAt: '2026-11-03T02:00:00Z' },
  canUseForPoiPreparation: usable,
}) as MapVersionItem

describe('staffMapLabels', () => {
  it('names the area and map, and marks the newest', () => {
    const items = [mapItem('a', 1, false), mapItem('b', 2)]
    const label = staffMapLabels(items)
    expect(label(items[0].map)).toBe('Tầng 6 · tang-6-v1')
    expect(label(items[1].map)).toBe('Tầng 6 · tang-6-v2 (mới nhất)')
  })

  it('marks no newest when an area has a single map, and keeps the map key for same-named areas', () => {
    const items = [mapItem('a', 1), { ...mapItem('b', 1), map: { ...mapItem('b', 1).map, areaKey: 'other', mapKey: 'other-v1' } } as MapVersionItem]
    const label = staffMapLabels(items)
    expect(label(items[0].map)).toBe('Tầng 6 · tang-6-v1')
    expect(label(items[1].map)).toBe('Tầng 6 · other-v1')
  })

  it('puts the reason a map cannot be chosen in the same brackets as "mới nhất"', () => {
    const items = [mapItem('a', 1), mapItem('b', 2)]
    const label = staffMapLabels(items)
    expect(label(items[1].map, 'chưa có POI đạt')).toBe('Tầng 6 · tang-6-v2 · tải lên 03/11 (mới nhất, chưa có POI đạt)')
    expect(label(items[0].map, 'chưa có POI đạt')).toBe('Tầng 6 · tang-6-v1 · tải lên 03/11 (chưa có POI đạt)')
  })

  it('adds the upload day only where an area has two usable maps to choose between', () => {
    const items = [mapItem('a', 1), mapItem('b', 2)]
    const label = staffMapLabels(items)
    expect(label(items[0].map)).toBe('Tầng 6 · tang-6-v1 · tải lên 03/11')
    expect(label(items[1].map)).toBe('Tầng 6 · tang-6-v2 · tải lên 03/11 (mới nhất)')
  })
})

describe('staffRouteStatus', () => {
  it.each([
    [{ isSubmitted: false, verificationStatus: 'NOT_CHECKED' }, 'Bản nháp'],
    [{ isSubmitted: true, verificationStatus: 'NOT_CHECKED' }, 'Chờ chạy thử'],
    [{ isSubmitted: true, verificationStatus: 'FAIL', scheduleFit: 'UNKNOWN' as const }, 'Chạy thử không đạt'],
    [{ isSubmitted: true, verificationStatus: 'PASS', scheduleFit: 'FITS' as const }, 'Đã chạy thử đạt'],
    [{ isSubmitted: true, verificationStatus: 'PASS' }, 'Đã chạy thử đạt'],
    [{ isSubmitted: true, verificationStatus: 'PASS', scheduleFit: 'UNKNOWN' as const }, 'Cần chạy thử lại'],
  ])('%o reads as %s', (route, label) => {
    expect(staffRouteStatus(route).label).toBe(label)
  })
})

const route = { routeId: 'route-1', revisionId: 'rev-2', revisionNumber: 7, name: 'Tuyến thư viện', description: 'Đi qua thư viện.', mapVersionId: 'map-1', mapKey: 'tang-6-v2',
  isSubmitted: true, verificationStatus: 'PASS', effectiveTestRunId: 'run-1', scheduleFit: 'FITS', dwellDurationSeconds: 60, isActive: true, rowVersion: 'AA==', eligibilityIssues: [],
  stops: [{ poiRevisionId: 'p1', sourcePoiVerificationRecordId: 'v', stopOrder: 1, dwellSeconds: 30, headSteps: [], name: 'Sảnh', x: 0, y: 0, yaw: 0, cameraPreset: 'FRONT' },
    { poiRevisionId: 'p2', sourcePoiVerificationRecordId: 'v', stopOrder: 2, dwellSeconds: 30, headSteps: [], name: 'Thư viện', x: 2, y: 0, yaw: 0, cameraPreset: 'FRONT' }],
  testRuns: [{ id: 'run-1', checkedAt: '2026-11-05T07:20:00Z', measurementBasis: 'TOTAL_WITH_DWELL', resultCode: 'PASS' }],
  revisionHistory: [{ revisionId: 'rev-2', revisionNumber: 7, isSubmitted: true, verificationStatus: 'PASS', createdAt: '2026-11-05T07:20:00Z' },
    { revisionId: 'rev-1', revisionNumber: 6, isSubmitted: true, verificationStatus: 'FAIL', createdAt: '2026-11-01T02:05:00Z' }] }

const show = (entry: string) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={[entry]}><Routes>
  <Route path="/staff/manage/routes" element={<StaffManageRouteCatalogPage />} />
  <Route path="/staff/manage/routes/:routeId" element={<StaffManageRouteDetailsPage />} />
</Routes></MemoryRouter></QueryClientProvider>)

describe('Route screens without version numbers', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://localhost')
      const data = url.pathname === '/api/routes' ? [route] : url.pathname === '/api/maps/versions' ? [mapItem('map-1', 2)] : route
      return new Response(JSON.stringify({ success: true, data, pagination: { page: 1, pageSize: 100, totalItems: 1, totalPages: 1 } }), { status: 200 })
    }))
  })
  afterEach(() => vi.unstubAllGlobals())

  it('the catalog card names the area and stops, with no history, map key or version', async () => {
    show('/staff/manage/routes')
    const card = (await screen.findByRole('link', { name: 'Tuyến thư viện' })).closest('article')!
    expect(await within(card).findByText('Tầng 6 · 2 điểm dừng')).toBeInTheDocument()
    expect(within(card).getByText('Đã chạy thử đạt')).toBeInTheDocument()
    expect(card).not.toHaveTextContent(/phiên bản|Lịch sử|tang-6-v2/i)
    expect(screen.getByText('Chỉ tuyến đã chạy thử đạt mới tạo được Tour.')).toBeInTheDocument()
    expect(screen.queryByText(/chưa được hỗ trợ/)).not.toBeInTheDocument()
  })

  it('the detail page gives the state by date, "Sửa tuyến", and a closed history by date', async () => {
    show('/staff/manage/routes/route-1')
    expect(await screen.findByText('Đã chạy thử đạt ngày 05/11')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sửa tuyến' })).toHaveAttribute('href', '/staff/manage/routes/route-1/edit')
    expect(screen.getByText(/Tour đã tạo vẫn dùng bản cũ/)).toBeInTheDocument()
    expect(screen.getByText('Đi qua thư viện.')).toBeInTheDocument()
    const history = screen.getByText('Lịch sử thay đổi').closest('details')!
    expect(history).not.toHaveAttribute('open')
    expect(within(history).getByText('Bản lưu 05/11 14:20 · Đã chạy thử đạt (đang xem)')).toBeInTheDocument()
    expect(within(history).getByText('Bản lưu 01/11 09:05 · Chạy thử không đạt').closest('a')).toHaveAttribute('href', '/staff/manage/routes/route-1?revisionId=rev-1')
    expect(document.body).not.toHaveTextContent(/phiên bản/i)
    // The map is named by its area, as on the catalog card, never by its raw key.
    const overview = screen.getByRole('region', { name: 'Tổng quan tuyến' })
    expect(await within(overview).findByText('Tầng 6')).toBeInTheDocument()
    expect(overview).not.toHaveTextContent('tang-6-v2')
    // One notice for the state, with the next step.
    expect(screen.getByText(/^Dùng được để tạo Tour/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ngừng sử dụng' })).toBeInTheDocument()
  })

  it('an older saved copy is named by its date', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => new Response(JSON.stringify({ success: true, data: String(input).includes('/api/maps/versions') ? [] : { ...route, revisionId: 'rev-1', revisionNumber: 6, verificationStatus: 'FAIL', effectiveTestRunId: null } }), { status: 200 })))
    show('/staff/manage/routes/route-1?revisionId=rev-1')
    expect(await screen.findByText('Đây là bản lưu 01/11 09:05, chỉ xem được.')).toBeInTheDocument()
  })
})
