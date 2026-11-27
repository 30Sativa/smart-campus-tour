import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MapVersionTable } from './MapVersionTable'
import type { MapRunningRobot, MapVersionItem, RobotReadiness } from './api/technical'

const raster = vi.hoisted(() => ({ state: { map: null as { imageUrl: string; width: number; height: number } | null, error: null as string | null, retry: vi.fn() } }))
vi.mock('../administration/pois/map/use-map-raster', () => ({ useMapRaster: () => raster.state }))

const version = (areaKey: string, areaName: string, versionNumber: number, overrides: Partial<MapVersionItem> = {}) => ({
  map: { id: `${areaKey}-${versionNumber}`, areaKey, areaName, versionNumber, packageFileName: `${areaKey}-v${versionNumber}.zip`, packageSha256: 'a'.repeat(64),
    imageWidth: 100, imageHeight: 80, resolution: 0.05, frameId: 'map', validationStatus: 'VALID', uploadedAt: '2026-10-29T03:00:00Z' },
  latestDeployment: null, technicalCheckStatus: 'PENDING', canUseForPoiPreparation: false, preparationBlockReasonCode: 'NO_CHECK', preparationBlockReason: 'Chưa có kết quả kiểm tra kỹ thuật.',
  preparationEvidence: null, currentlyDeployedOn: [], runningRobot: null, ...overrides,
}) as unknown as MapVersionItem
const passed = { technicalCheckStatus: 'PASSED', canUseForPoiPreparation: true, preparationBlockReasonCode: null, preparationBlockReason: null,
  preparationEvidence: { robotCode: 'amr_01', checkedAt: '2026-10-30T08:14:00Z' } } as unknown as Partial<MapVersionItem>
const ready = (mapLabel: string): RobotReadiness => ({ state: 'READY', reasonCode: null, reason: null, mapVersionId: null, mapLabel, deploymentCheckedAt: '2026-10-30T08:14:00Z', reportingOnAssignedMap: true })
const running = (overrides: Partial<MapRunningRobot> = {}): { runningRobot: MapRunningRobot } => ({ runningRobot: { id: 'robot-1', robotCode: 'amr_01', displayName: null, readiness: ready('Tầng 6 · v1'), ...overrides } })
// "Robot đang chạy" comes from the server's runningRobot (spec W3); currentlyDeployedOn is no longer read.
const onRobot = running()
const show = (items: MapVersionItem[]) => {
  const onUpload = vi.fn()
  const onRetire = vi.fn()
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><MapVersionTable items={items} onUpload={onUpload} onRetire={onRetire} /></MemoryRouter></QueryClientProvider>)
  return { onUpload, onRetire }
}
const dataRows = () => screen.getAllByRole('row').slice(1)

describe('MapVersionTable', () => {
  // "Triển khai cho robot…" lists the registered robots.
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ success: true, data: [] }), { status: 200 }))) })
  afterEach(() => { vi.unstubAllGlobals() })

  it('keeps each row to what decides the next step and hides the file facts', () => {
    show([version('tang-6', 'Tầng 6', 1, { ...passed, ...onRobot })])
    expect(screen.getAllByRole('columnheader').map(header => header.textContent)).toEqual(['Khu vực↕', 'Phiên bản↕', 'Tải lên lúc↕', 'Tệp bản đồ↕', 'Robot đang chạy↕', 'Thao tác'])
    const row = dataRows()[0]
    expect(row).toHaveTextContent('Tầng 6')
    expect(row).toHaveTextContent('Hợp lệ')
    expect(row).toHaveTextContent('amr_01')
    expect(row).toHaveTextContent('Sẵn sàng · Tầng 6 · v1')
    expect(within(row).queryByRole('button', { name: 'Ghi kết quả kiểm tra' })).not.toBeInTheDocument()
    // Every row names the area and its key, so two areas called "Tầng 6" are never confused (ADR-0041).
    expect(within(row).getByText('tang-6')).toBeInTheDocument()
    expect(screen.queryByText('tang-6-v1.zip')).not.toBeInTheDocument()
  })

  it('opens the left-out facts from the eye, and acts on that version from there', async () => {
    const later = version('a', 'A', 2, passed)
    const { onUpload } = show([later, version('a', 'A', 1)])
    fireEvent.click(screen.getByRole('button', { name: 'Xem chi tiết A · v2' }))
    const detail = screen.getByRole('dialog', { name: 'A · v2' })
    expect(detail).toHaveTextContent('Dùng được để soạn POI')
    expect(detail).toHaveTextContent('a-v2.zip')
    expect(detail).toHaveTextContent('a'.repeat(64))
    // The deployment check is recorded in the robot's setup now; the detail hands the version over to a robot.
    expect(within(detail).queryByRole('button', { name: 'Ghi kết quả kiểm tra' })).not.toBeInTheDocument()
    fireEvent.click(within(detail).getByRole('button', { name: 'Triển khai cho robot…' }))
    expect(await screen.findByRole('dialog', { name: 'Triển khai A · v2 cho robot' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Hủy' }))
    fireEvent.click(screen.getByRole('button', { name: 'Xem phiên bản 1' }))
    expect(screen.getByRole('dialog', { name: 'A · v1' })).toHaveTextContent('phiên bản cũ, mới nhất là phiên bản 2')
    fireEvent.click(screen.getByRole('button', { name: 'Tải phiên bản mới' }))
    expect(onUpload).toHaveBeenCalledWith({ areaKey: 'a', displayName: 'A' })
  })

  it('says which robot runs the area, read-only, and links to that robot to change it', () => {
    show([version('a', 'A', 2, passed), version('a', 'A', 1, running({ id: 'robot-7', robotCode: 'amr_07', displayName: 'AMR 07', readiness: ready('A · v1') }))])
    fireEvent.click(screen.getByRole('button', { name: 'Xem chi tiết A · v2' }))
    const newest = screen.getByRole('dialog', { name: 'A · v2' })
    expect(newest).toHaveTextContent('Chưa có. AMR 07 đang chạy phiên bản 1.')
    fireEvent.click(screen.getByRole('button', { name: 'Xem phiên bản 1' }))
    const detail = screen.getByRole('dialog', { name: 'A · v1' })
    expect(within(detail).getByRole('link', { name: 'AMR 07 · amr_07' })).toHaveAttribute('href', '/technical/robots?robot=robot-7')
    expect(detail).toHaveTextContent('Sẵn sàng · A · v1')
    expect(detail).toHaveTextContent('Đổi bản đồ và kiểm tra triển khai trong hộp Thiết lập của robot.')
    expect(within(detail).queryByRole('button', { name: /Gán bản đồ|Đổi bản đồ/ })).not.toBeInTheDocument()
  })

  it('keeps the checks that once passed as read-only history, apart from the running robot', () => {
    show([version('a', 'A', 1, passed)])
    fireEvent.click(screen.getByRole('button', { name: 'Xem chi tiết A · v1' }))
    const detail = screen.getByRole('dialog', { name: 'A · v1' })
    expect(detail).toHaveTextContent('Chưa có robot')
    expect(detail).toHaveTextContent(/Đã từng kiểm tra đạtamr_01 · /)
  })

  it('offers to retire the version shown in the detail', () => {
    const older = version('a', 'A', 1)
    const { onRetire } = show([version('a', 'A', 2, passed), older])
    fireEvent.click(screen.getByRole('button', { name: 'Xem chi tiết A · v2' }))
    fireEvent.click(screen.getByRole('button', { name: 'Xem phiên bản 1' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ngừng sử dụng phiên bản này' }))
    expect(onRetire).toHaveBeenCalledWith(older)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('says when no robot holds the area', () => {
    show([version('a', 'A', 1)])
    fireEvent.click(screen.getByRole('button', { name: 'Xem chi tiết A · v1' }))
    expect(screen.getByRole('dialog', { name: 'A · v1' })).toHaveTextContent('Chưa có robot')
  })

  it('shows the uploaded floor plan in the detail, and says so when it cannot load', () => {
    raster.state = { map: { imageUrl: 'data:image/png;base64,AA==', width: 100, height: 80 }, error: null, retry: vi.fn() }
    show([version('tang-6', 'Tầng 6', 1)])
    fireEvent.click(screen.getByRole('button', { name: 'Xem chi tiết Tầng 6 · v1' }))
    expect(screen.getByRole('img', { name: 'Bản đồ Tầng 6 · v1' })).toHaveAttribute('src', 'data:image/png;base64,AA==')
    fireEvent.click(screen.getByRole('button', { name: 'Đóng' }))
    const retry = vi.fn()
    raster.state = { map: null, error: 'Máy chủ không trả về được bản đồ này.', retry }
    fireEvent.click(screen.getByRole('button', { name: 'Xem chi tiết Tầng 6 · v1' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Máy chủ không trả về được bản đồ này.')
    fireEvent.click(screen.getByRole('button', { name: 'Tải lại bản đồ' }))
    expect(retry).toHaveBeenCalled()
    raster.state = { map: null, error: null, retry: vi.fn() }
  })

  it('splits the file check from the run on a robot', () => {
    show([version('a', 'A', 3), version('b', 'B', 2, { technicalCheckStatus: 'FAILED' }), version('c', 'C', 1, { map: { ...version('c', 'C', 1).map, validationStatus: 'INVALID' } as MapVersionItem['map'] })])
    expect(dataRows().map(row => within(row).getAllByRole('cell')[3].textContent)).toEqual(['Hợp lệ', 'Hợp lệ', 'Không hợp lệ'])
    // A failed check is the version's status, not a robot: the robot column only names the robot running it.
    expect(dataRows().map(row => within(row).getAllByRole('cell')[4].textContent)).toEqual(['Chưa có robot', 'Chưa có robot', 'Chưa có robot'])
  })

  it('finds an area by name or key', () => {
    show([version('thu-vien', 'Thư viện', 1), version('tang-6', 'Tầng 6', 1)])
    fireEvent.change(screen.getByLabelText('Tìm khu vực'), { target: { value: 'TANG-6' } })
    expect(dataRows()).toHaveLength(1)
    fireEvent.change(screen.getByLabelText('Tìm khu vực'), { target: { value: 'không có' } })
    expect(screen.getByText('Không có khu vực nào phù hợp')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Xóa bộ lọc' }))
    expect(dataRows()).toHaveLength(2)
  })

  it('sorts by a column, flips on a second press, and leaves the API order until asked', () => {
    // A robot that is not ready needs attention first, then a ready one, then none.
    const notReady: RobotReadiness = { ...ready('Tầng 2 · v3'), state: 'NOT_READY', reason: 'Robot amr_02 chưa có kiểm tra triển khai đạt trên bản đồ đang gán.' }
    show([version('b', 'Tầng 10', 1, passed), version('a', 'Tầng 2', 3, running({ id: 'robot-2', robotCode: 'amr_02', readiness: notReady })), version('c', 'Áo', 2, { ...passed, ...onRobot })])
    const areas = () => dataRows().map(row => within(row).getAllByRole('cell')[0].querySelector('span')?.textContent)
    expect(areas()).toEqual(['Tầng 10', 'Tầng 2', 'Áo'])
    const heading = screen.getByRole('columnheader', { name: /Khu vực/ })
    expect(heading).toHaveAttribute('aria-sort', 'none')
    fireEvent.click(screen.getByRole('button', { name: 'Sắp xếp theo Khu vực' }))
    expect(heading).toHaveAttribute('aria-sort', 'ascending')
    expect(areas()).toEqual(['Áo', 'Tầng 2', 'Tầng 10'])
    fireEvent.click(screen.getByRole('button', { name: 'Sắp xếp theo Khu vực' }))
    expect(heading).toHaveAttribute('aria-sort', 'descending')
    expect(areas()).toEqual(['Tầng 10', 'Tầng 2', 'Áo'])
    fireEvent.click(screen.getByRole('button', { name: 'Sắp xếp theo Robot đang chạy' }))
    expect(areas()[0]).toBe('Tầng 2')
    expect(heading).toHaveAttribute('aria-sort', 'none')
    fireEvent.click(screen.getByRole('button', { name: 'Sắp xếp theo Robot đang chạy' }))
    expect(areas()[2]).toBe('Tầng 2')
    fireEvent.click(screen.getByRole('button', { name: 'Sắp xếp theo Phiên bản' }))
    expect(areas()[2]).toBe('Tầng 2')
  })

  it('shows when a version was uploaded and sorts by it', () => {
    const at = (item: MapVersionItem, uploadedAt: string) => ({ ...item, map: { ...item.map, uploadedAt } })
    show([at(version('a', 'A', 1), '2026-10-28T03:00:00Z'), at(version('b', 'B', 1), '2026-10-29T03:00:00Z')])
    expect(within(dataRows()[0]).getAllByRole('cell')[2]).toHaveTextContent('28/10/2026 10:00')
    fireEvent.click(screen.getByRole('button', { name: 'Sắp xếp theo Tải lên lúc' }))
    fireEvent.click(screen.getByRole('button', { name: 'Sắp xếp theo Tải lên lúc' }))
    expect(within(dataRows()[0]).getAllByRole('cell')[2]).toHaveTextContent('29/10/2026 10:00')
  })

  it('goes back to the first page when the sort changes', () => {
    show(Array.from({ length: 12 }, (_, index) => version(`area-${index}`, `Khu ${index}`, 1)))
    const pages = () => screen.getByRole('navigation', { name: 'Phân trang danh sách bản đồ' })
    fireEvent.click(within(pages()).getByRole('button', { name: /sau/i }))
    expect(pages()).toHaveTextContent('11-12 trên 12')
    fireEvent.click(screen.getByRole('button', { name: 'Sắp xếp theo Khu vực' }))
    expect(pages()).toHaveTextContent('1-10 trên 12')
  })

  it('shows one row per area led by its newest version, and flags a robot still on an older one', () => {
    show([version('tang-6', 'Tầng 6', 1, { ...passed, ...onRobot }), version('tang-6', 'Tầng 6', 3), version('tang-6', 'Tầng 6', 2), version('test123', 'Tầng 6', 1)])
    expect(dataRows()).toHaveLength(2)
    const [tang6, test123] = dataRows()
    expect(within(tang6).getAllByRole('cell')[1]).toHaveTextContent('32 bản cũ')
    expect(within(tang6).getAllByRole('cell')[3]).toHaveTextContent('Hợp lệ')
    // Two areas share the display name; each row shows its key beside it.
    expect(within(tang6).getAllByRole('cell')[0]).toHaveTextContent(/^Tầng 6 tang-6/)
    expect(within(test123).getAllByRole('cell')[0]).toHaveTextContent(/^Tầng 6 test123/)
    expect(within(tang6).getAllByRole('cell')[4]).toHaveTextContent('amr_01 · phiên bản 1')
    expect(within(test123).getAllByRole('cell')[1]).toHaveTextContent(/^1$/)
    fireEvent.click(within(tang6).getByRole('button', { name: 'Xem chi tiết Tầng 6 · tang-6 · v3' }))
    const history = within(screen.getByRole('dialog', { name: 'Tầng 6 · tang-6 · v3' })).getByRole('region', { name: 'Lịch sử phiên bản' })
    expect(within(history).getAllByRole('listitem').map(item => item.textContent?.slice(0, 11))).toEqual(['Phiên bản 3', 'Phiên bản 2', 'Phiên bản 1'])
  })

  it('pages ten versions at a time', () => {
    show(Array.from({ length: 12 }, (_, index) => version(`area-${index}`, `Khu ${index}`, 1)))
    expect(dataRows()).toHaveLength(10)
    expect(screen.getByRole('navigation', { name: 'Phân trang danh sách bản đồ' })).toHaveTextContent('1-10 trên 12')
  })

  it('names the robot running the map by name with its readiness, and says Chưa có robot when none does', () => {
    show([version('a', 'A', 1, { ...passed, ...running({ displayName: 'AMR 01', readiness: ready('A · v1') }) }), version('b', 'B', 1, { ...passed, currentlyDeployedOn: [{ robotCode: 'amr_09', checkedAt: '2026-10-30T08:14:00Z' }] })])
    const [ran, notYet] = dataRows()
    expect(within(ran).getAllByRole('cell')[4]).toHaveTextContent(/^AMR 01Sẵn sàng · A · v1$/)
    // currentlyDeployedOn ("last check passed here") no longer means running here.
    expect(within(notYet).getAllByRole('cell')[4]).toHaveTextContent(/^Chưa có robot$/)
  })
})
