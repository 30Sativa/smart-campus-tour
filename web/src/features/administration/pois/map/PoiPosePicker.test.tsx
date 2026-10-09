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

function renderPicker({ editable = true, initialPose = { x: 0, y: 0, yaw: 0 } as PickerPose } = {}) {
  const onPose = vi.fn()
  function Harness() {
    const [pose, setPose] = useState(initialPose)
    const [mode, setMode] = useState<PickerMode>('pan')
    return <PoiPosePicker map={map} pose={pose} mode={mode} editable={editable} onModeChange={setMode} onPoseChange={(next) => { onPose(next); setPose(next) }} />
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
