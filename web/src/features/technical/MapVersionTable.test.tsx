import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { MapVersionTable } from './MapVersionTable'
import type { MapVersionItem, PhysicalRobotOption } from './api/technical'

const raster = vi.hoisted(() => ({ state: { map: null as { imageUrl: string; width: number; height: number } | null, error: null as string | null, retry: vi.fn() } }))
vi.mock('../administration/pois/map/use-map-raster', () => ({ useMapRaster: () => raster.state }))

const version = (areaKey: string, areaName: string, versionNumber: number, overrides: Partial<MapVersionItem> = {}) => ({
  map: { id: `${areaKey}-${versionNumber}`, areaKey, areaName, versionNumber, packageFileName: `${areaKey}-v${versionNumber}.zip`, packageSha256: 'a'.repeat(64),
    imageWidth: 100, imageHeight: 80, resolution: 0.05, frameId: 'map', validationStatus: 'VALID', uploadedAt: '2026-10-29T03:00:00Z' },
  latestDeployment: null, technicalCheckStatus: 'PENDING', canUseForPoiPreparation: false, preparationBlockReasonCode: 'NO_CHECK', preparationBlockReason: 'Chưa có kết quả kiểm tra kỹ thuật.',
  preparationEvidence: null, currentlyDeployedOn: [], ...overrides,
}) as unknown as MapVersionItem
const passed = { technicalCheckStatus: 'PASSED', canUseForPoiPreparation: true, preparationBlockReasonCode: null, preparationBlockReason: null,
  preparationEvidence: { robotCode: 'amr_01', checkedAt: '2026-10-30T08:14:00Z' } } as unknown as Partial<MapVersionItem>
const onRobot = { currentlyDeployedOn: [{ robotCode: 'amr_01', checkedAt: '2026-10-30T08:14:00Z' }] }
const noRobots = { data: [] as PhysicalRobotOption[], isPending: false, isError: false }
const show = (items: MapVersionItem[], robots = noRobots) => {
  const onUpload = vi.fn()
  const onCheck = vi.fn()
  render(<MemoryRouter><MapVersionTable items={items} robots={robots} onUpload={onUpload} onCheck={onCheck} /></MemoryRouter>)
  return { onUpload, onCheck }
}
const dataRows = () => screen.getAllByRole('row').slice(1)

describe('MapVersionTable', () => {
  it('keeps each row to what decides the next step and hides the file facts', () => {
    show([version('tang-6', 'Tầng 6', 1, { ...passed, ...onRobot })])
    expect(screen.getAllByRole('columnheader').map(header => header.textContent)).toEqual(['Khu vực↕', 'Phiên bản↕', 'Tải lên lúc↕', 'Trạng thái↕', 'Robot đang triển khai↕', 'Thao tác'])
    const row = dataRows()[0]
    expect(row).toHaveTextContent('Tầng 6')
    expect(row).toHaveTextContent('Đạt kiểm tra')
    expect(row).toHaveTextContent('amr_01')
    expect(within(row).getByText('tang-6')).toBeInTheDocument()
    expect(screen.queryByText('tang-6-v1.zip')).not.toBeInTheDocument()
  })

  it('opens the left-out facts from the eye, and acts on that version from there', () => {
    const later = version('a', 'A', 2, passed)
    const { onUpload, onCheck } = show([later, version('a', 'A', 1)])
    fireEvent.click(screen.getByRole('button', { name: 'Xem chi tiết A · phiên bản 2' }))
    const detail = screen.getByRole('dialog', { name: 'A · phiên bản 2' })
    expect(detail).toHaveTextContent('Dùng được để tạo POI')
    expect(detail).toHaveTextContent('a-v2.zip')
    expect(detail).toHaveTextContent('a'.repeat(64))
    fireEvent.click(within(detail).getByRole('button', { name: 'Ghi kết quả kiểm tra' }))
    expect(onCheck).toHaveBeenCalledWith(later)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Xem chi tiết A · phiên bản 2' }))
    fireEvent.click(screen.getByRole('button', { name: 'Xem phiên bản 1' }))
    expect(screen.getByRole('dialog', { name: 'A · phiên bản 1' })).toHaveTextContent('phiên bản cũ, mới nhất là phiên bản 2')
    fireEvent.click(screen.getByRole('button', { name: 'Tải phiên bản mới' }))
    expect(onUpload).toHaveBeenCalledWith({ areaKey: 'a', displayName: 'A' })
  })

  it('says which robot holds the area, read-only, and links to that robot to change it', () => {
    const robot = { id: 'robot-7', robotCode: 'amr_07', displayName: 'AMR 07', assignedMapVersionId: 'a-1', assignedVersionNumber: 1 } as PhysicalRobotOption
    const elsewhere = { id: 'robot-8', robotCode: 'amr_08', displayName: null, assignedMapVersionId: 'b-1', assignedVersionNumber: 1 } as PhysicalRobotOption
    show([version('a', 'A', 2, passed), version('a', 'A', 1)], { data: [robot, elsewhere], isPending: false, isError: false })
    fireEvent.click(screen.getByRole('button', { name: 'Xem chi tiết A · phiên bản 2' }))
    const detail = screen.getByRole('dialog', { name: 'A · phiên bản 2' })
    expect(within(detail).getByRole('link', { name: 'AMR 07 · amr_07 · phiên bản 1' })).toHaveAttribute('href', '/technical/robots?robot=robot-7')
    expect(detail).not.toHaveTextContent('amr_08')
    expect(detail).toHaveTextContent('Gán hoặc đổi bản đồ ở trang Robot.')
    expect(within(detail).queryByRole('button', { name: /Gán bản đồ|Thay đổi bản đồ/ })).not.toBeInTheDocument()
  })

  it('says when no robot holds the area', () => {
    show([version('a', 'A', 1)])
    fireEvent.click(screen.getByRole('button', { name: 'Xem chi tiết A · phiên bản 1' }))
    expect(screen.getByRole('dialog', { name: 'A · phiên bản 1' })).toHaveTextContent('Chưa có robot nào được gán khu vực này')
  })

  it('shows the uploaded floor plan in the detail, and says so when it cannot load', () => {
    raster.state = { map: { imageUrl: 'data:image/png;base64,AA==', width: 100, height: 80 }, error: null, retry: vi.fn() }
    show([version('tang-6', 'Tầng 6', 1)])
    fireEvent.click(screen.getByRole('button', { name: 'Xem chi tiết Tầng 6 · phiên bản 1' }))
    expect(screen.getByRole('img', { name: 'Bản đồ Tầng 6 · phiên bản 1' })).toHaveAttribute('src', 'data:image/png;base64,AA==')
    fireEvent.click(screen.getByRole('button', { name: 'Đóng' }))
    const retry = vi.fn()
    raster.state = { map: null, error: 'Máy chủ không trả về được bản đồ này.', retry }
    fireEvent.click(screen.getByRole('button', { name: 'Xem chi tiết Tầng 6 · phiên bản 1' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Máy chủ không trả về được bản đồ này.')
    fireEvent.click(screen.getByRole('button', { name: 'Tải lại bản đồ' }))
    expect(retry).toHaveBeenCalled()
    raster.state = { map: null, error: null, retry: vi.fn() }
  })

  it('reads the file, the check and POI eligibility as one status', () => {
    show([version('a', 'A', 3), version('b', 'B', 2, { technicalCheckStatus: 'FAILED' }), version('c', 'C', 1, { map: { ...version('c', 'C', 1).map, validationStatus: 'INVALID' } as MapVersionItem['map'] })])
    expect(dataRows().map(row => within(row).getAllByRole('cell')[3].textContent)).toEqual(['Chờ kiểm tra', 'Kiểm tra chưa đạt', 'Tệp không hợp lệ'])
  })

  it('finds an area by name or key', () => {
    show([version('thu-vien', 'Thư viện', 1), version('tang-6', 'Tầng 6', 1)])
    fireEvent.change(screen.getByLabelText('Tìm khu vực'), { target: { value: 'TANG-6' } })
    expect(dataRows()).toHaveLength(1)
    fireEvent.change(screen.getByLabelText('Tìm khu vực'), { target: { value: 'không có' } })
    expect(screen.getByText('Không có khu vực nào phù hợp.')).toBeInTheDocument()
  })

  it('sorts by a column, flips on a second press, and leaves the API order until asked', () => {
    show([version('b', 'Tầng 10', 1, passed), version('a', 'Tầng 2', 3), version('c', 'Áo', 2, { ...passed, ...onRobot })])
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
    fireEvent.click(screen.getByRole('button', { name: 'Sắp xếp theo Trạng thái' }))
    expect(areas()[0]).toBe('Tầng 2')
    expect(heading).toHaveAttribute('aria-sort', 'none')
    fireEvent.click(screen.getByRole('button', { name: 'Sắp xếp theo Robot đang triển khai' }))
    expect(areas()[0]).toBe('Áo')
    fireEvent.click(screen.getByRole('button', { name: 'Sắp xếp theo Phiên bản' }))
    expect(areas()[2]).toBe('Tầng 2')
  })

  it('shows when a version was uploaded and sorts by it', () => {
    const at = (item: MapVersionItem, uploadedAt: string) => ({ ...item, map: { ...item.map, uploadedAt } })
    show([at(version('a', 'A', 1), '2026-10-28T03:00:00Z'), at(version('b', 'B', 1), '2026-10-29T03:00:00Z')])
    expect(within(dataRows()[0]).getAllByRole('cell')[2]).toHaveTextContent(/\d{2}:\d{2} 28-10/)
    fireEvent.click(screen.getByRole('button', { name: 'Sắp xếp theo Tải lên lúc' }))
    fireEvent.click(screen.getByRole('button', { name: 'Sắp xếp theo Tải lên lúc' }))
    expect(within(dataRows()[0]).getAllByRole('cell')[2]).toHaveTextContent(/29-10/)
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
    expect(within(tang6).getAllByRole('cell')[3]).toHaveTextContent('Chờ kiểm tra')
    expect(within(tang6).getAllByRole('cell')[4]).toHaveTextContent('amr_01 · đang ở phiên bản 1')
    expect(within(test123).getAllByRole('cell')[1]).toHaveTextContent(/^1$/)
    fireEvent.click(within(tang6).getByRole('button', { name: 'Xem chi tiết Tầng 6 · phiên bản 3' }))
    const history = within(screen.getByRole('dialog', { name: 'Tầng 6 · phiên bản 3' })).getByRole('region', { name: 'Lịch sử phiên bản' })
    expect(within(history).getAllByRole('listitem').map(item => item.textContent?.slice(0, 11))).toEqual(['Phiên bản 3', 'Phiên bản 2', 'Phiên bản 1'])
  })

  it('pages ten versions at a time', () => {
    show(Array.from({ length: 12 }, (_, index) => version(`area-${index}`, `Khu ${index}`, 1)))
    expect(dataRows()).toHaveLength(10)
    expect(screen.getByRole('navigation', { name: 'Phân trang danh sách bản đồ' })).toHaveTextContent('1-10 trên 12')
  })
})
