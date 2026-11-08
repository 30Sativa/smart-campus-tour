import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_POI_MAP } from './catalog'
import { loadMapImage } from './load-map-image'
import { PoiPosePicker, type PickerMode, type PickerPose } from './PoiPosePicker'
import { installSvgLayout, pointerAt } from './picker-test-support'

vi.mock('./load-map-image', () => ({ loadMapImage: vi.fn() }))
const map = { ...DEFAULT_POI_MAP, width: 40, height: 30, origin: [-1, -1, 0] as const }
let restoreLayout: () => void

function renderPicker({ editable = true, initialPose = { x: 0, y: 0, yaw: 0 } as PickerPose, clearanceMeters = undefined as number | undefined } = {}) {
  const onPose = vi.fn()
  function Harness() {
    const [pose, setPose] = useState(initialPose)
    const [mode, setMode] = useState<PickerMode>('pan')
    return <PoiPosePicker map={map} pose={pose} mode={mode} editable={editable} onModeChange={setMode} onPoseChange={(next) => { onPose(next); setPose(next) }} clearanceMeters={clearanceMeters} />
  }
  render(<Harness />)
  return onPose
}

describe('POI pose picker', () => {
  beforeEach(() => {
    restoreLayout = installSvgLayout()
    vi.mocked(loadMapImage).mockReset().mockResolvedValue({ pixels: null })
  })
  afterEach(() => { restoreLayout(); vi.unstubAllGlobals() })

  it('selects continuous ROS position and +Y heading after zoom and pan', async () => {
    const onPose = renderPicker()
    const svg = await screen.findByRole('group', { name: 'Bản đồ occupancy ROS' }) as unknown as SVGSVGElement
    fireEvent.click(screen.getByRole('button', { name: 'Phóng to' }))
    const initialView = svg.getAttribute('viewBox')
    fireEvent.pointerDown(svg, { clientX: 500, clientY: 260, button: 0, pointerId: 1 })
    fireEvent.pointerMove(svg, { clientX: 528, clientY: 260, pointerId: 1 })
    fireEvent.pointerUp(svg, { pointerId: 1 })
    expect(svg.getAttribute('viewBox')).not.toBe(initialView)
    expect(onPose).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Chọn vị trí' }))
    fireEvent.pointerDown(svg, pointerAt(svg, 20, 10))
    expect(onPose).toHaveBeenLastCalledWith({ x: 0, y: 0, yaw: null })
    expect(screen.getByRole('button', { name: 'Chọn hướng' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.pointerMove(svg, pointerAt(svg, 20, 8))
    expect(onPose).toHaveBeenCalledTimes(1)
    fireEvent.pointerDown(svg, pointerAt(svg, 20, 8))
    expect(onPose).toHaveBeenLastCalledWith({ x: 0, y: 0, yaw: 1.570796 })
    expect(screen.getByRole('button', { name: 'Di chuyển bản đồ' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('draws the required free radius and warns before submit when an obstacle is inside it', async () => {
    const pixels = new Uint8ClampedArray(map.width * map.height * 4).fill(255)
    vi.mocked(loadMapImage).mockResolvedValue({ pixels })
    const { unmount } = render(<PoiPosePicker map={map} pose={{ x: 0, y: 0, yaw: 0 }} mode="pan" editable onModeChange={() => {}} onPoseChange={() => {}} clearanceMeters={0.3} />)
    const circle = await screen.findByTestId('clearance-circle')
    expect(circle).toHaveAttribute('r', String(0.3 / map.resolution))
    expect(screen.getByRole('status')).toHaveTextContent(/^Ô trống trên bản đồ/)
    unmount()

    const cell = (Math.round((map.height - 1) - 1 / map.resolution) * map.width + Math.round(1.1 / map.resolution)) * 4
    pixels.fill(0, cell, cell + 3)
    render(<PoiPosePicker map={map} pose={{ x: 0, y: 0, yaw: 0 }} mode="pan" editable onModeChange={() => {}} onPoseChange={() => {}} clearanceMeters={0.3} />)
    await screen.findByTestId('clearance-circle')
    expect(screen.getByRole('status')).toHaveTextContent('Điểm quá sát vật cản (cần trống bán kính 0,30 m).')
  })

  it('on a Staff route screen, draws the stops with their spacing, prompts for what it places and folds the radians away', async () => {
    render(<PoiPosePicker map={map} pose={{ x: 0, y: 0, yaw: Math.PI / 2 }} mode="position" editable onModeChange={() => {}} onPoseChange={() => {}}
      placing="điểm kết thúc" landmarks={[{ x: 1, y: 0, label: '1', name: 'Sảnh' }]} landmarkRadiusMeters={1.5} />)
    const svg = await screen.findByRole('group', { name: 'Bản đồ occupancy ROS' })
    const stop = svg.querySelector('[aria-label="1. Sảnh"]')!
    expect(stop.querySelector('circle')).toHaveAttribute('r', String(1.5 / map.resolution))
    expect(screen.getByText('Bấm vào bản đồ để đặt điểm kết thúc.')).toBeInTheDocument()
    expect(screen.getByText('90°')).toBeInTheDocument()
    expect(screen.getByText('Chi tiết kỹ thuật').closest('details')).not.toHaveAttribute('open')
    expect(screen.queryByText(/Độ phân giải bản đồ: /, { selector: 'p.text-xs' })).not.toBeInTheDocument()
  })

  it('keeps the POI wording and inline technical values without the Staff route options', async () => {
    renderPicker()
    await screen.findByRole('group', { name: 'Bản đồ occupancy ROS' })
    expect(screen.getByText('Yaw 0 = +X, chiều dương quay về +Y')).toBeInTheDocument()
    expect(screen.queryByText('Chi tiết kỹ thuật')).not.toBeInTheDocument()
  })

  it('shows no circle when the screen has no required radius', async () => {
    renderPicker()
    await screen.findByRole('group', { name: 'Bản đồ occupancy ROS' })
    expect(screen.queryByTestId('clearance-circle')).not.toBeInTheDocument()
  })

  it('keeps locked pose unchanged while allowing view controls', async () => {
    const onPose = renderPicker({ editable: false })
    const svg = await screen.findByRole('group', { name: 'Bản đồ occupancy ROS' })
    expect(screen.getByRole('button', { name: 'Chọn vị trí' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Chọn hướng' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Phóng to' }))
    fireEvent.pointerDown(svg, { clientX: 500, clientY: 260, button: 0, pointerId: 1 })
    fireEvent.pointerMove(svg, { clientX: 528, clientY: 260, pointerId: 1 })
    fireEvent.pointerUp(svg, { pointerId: 1 })
    expect(onPose).not.toHaveBeenCalled()
    expect(svg.getAttribute('viewBox')).not.toBe('0 0 40 30')
  })

  it.each([[0, 0], [Math.PI / 2, -90], [-Math.PI / 2, 90], [Math.PI, -180]])('draws ROS yaw %s with SVG rotation %s', async (yaw, rotation) => {
    renderPicker({ initialPose: { x: 0, y: 0, yaw } })
    const svg = await screen.findByRole('group', { name: 'Bản đồ occupancy ROS' })
    expect(svg.querySelector('[aria-label="Pose POI"] > g')).toHaveAttribute('transform', `rotate(${rotation})`)
  })

  it('cancels heading preview and rejects blank margins or coincident heading clicks', async () => {
    const onPose = renderPicker()
    const svg = await screen.findByRole('group', { name: 'Bản đồ occupancy ROS' }) as unknown as SVGSVGElement
    fireEvent.click(screen.getByRole('button', { name: 'Chọn hướng' }))
    fireEvent.pointerDown(svg, pointerAt(svg, 20, 10))
    expect(onPose).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('Chọn hướng cách điểm POI')
    fireEvent.pointerMove(svg, pointerAt(svg, 30, 10))
    fireEvent.keyDown(svg, { key: 'Escape' })
    expect(onPose).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Di chuyển bản đồ' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Chọn vị trí' }))
    fireEvent.pointerDown(svg, pointerAt(svg, -10, 10))
    expect(onPose).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('bên trong bản đồ')
    fireEvent.pointerDown(svg, pointerAt(svg, -0.0001, 10))
    expect(onPose).not.toHaveBeenCalled()
  })

  it('warns on occupied cells without preventing pose input', async () => {
    const pixels = new Uint8ClampedArray(map.width * map.height * 4)
    for (let index = 3; index < pixels.length; index += 4) pixels[index] = 255
    vi.mocked(loadMapImage).mockResolvedValue({ pixels })
    renderPicker()
    expect(await screen.findByText(/Điểm nằm trên ô có vật cản/)).toBeInTheDocument()
  })

  it('reports image failure with a retry and never enables map interaction on failure', async () => {
    vi.mocked(loadMapImage).mockRejectedValueOnce(new Error('wrong dimensions')).mockResolvedValue({ pixels: null })
    renderPicker({ initialPose: { x: 500, y: 500, yaw: 0 } })
    expect(await screen.findByText(/Không tải được ảnh đúng kích thước/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Chọn vị trí' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Tải lại bản đồ' }))
    const svg = await screen.findByRole('group', { name: 'Bản đồ occupancy ROS' })
    expect(svg.querySelector('[aria-label="Pose POI"]')).toBeNull()
    expect(screen.getByText(/Pose nằm ngoài phạm vi bản đồ/)).toBeInTheDocument()
  })
})
