import { useEffect, useImperativeHandle } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { CampusMap3D } from './CampusMap3D'
import type { CampusSceneProps } from './CampusMap3DScene'
import { CAMPUS_MODEL } from '../campus-model'

const camera = vi.hoisted(() => ({ overview: vi.fn(), focus: vi.fn(), zoom: vi.fn() }))

// Test the DOM controls, not WebGL output. Geometry and camera math have their
// own tests; rendering the actual canvas must be checked in a browser.
vi.mock('./CampusMap3DScene', () => ({ default: function Scene({ cameraRef, onReady, topView, showLabels }: CampusSceneProps) {
  useImperativeHandle(cameraRef, () => camera)
  useEffect(() => onReady(), [onReady])
  return <div aria-label="Scene state">{topView ? 'Top camera' : 'Orbit camera'} · {showLabels ? 'Labels visible' : 'Labels hidden'}</div>
} }))

const pins = [{ id: 'library', name: 'Library', x: 20, y: 30, role: 'place' as const }]
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks() })

describe('3D campus map controls', () => {
  it('explains WebGL unavailability without offering dead camera controls', () => {
    vi.stubGlobal('WebGL2RenderingContext', undefined)
    render(<CampusMap3D pins={pins} selectedId="library" onSelect={vi.fn()} />)
    expect(screen.getByText('3D is unavailable on this device')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Zoom in' })).toBeDisabled()
    expect(screen.getByText(/Library has not been placed/)).toBeVisible()
  })

  it('switches views, zooms, resets and focuses only surveyed locations', async () => {
    vi.stubGlobal('WebGL2RenderingContext', class {})
    const config = { ...CAMPUS_MODEL, locationAnchors: { library: [2, 3, 1] as [number, number, number] } }
    render(<CampusMap3D config={config} pins={pins} selectedId="library" onSelect={vi.fn()} />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Zoom in' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }))
    expect(camera.zoom).toHaveBeenCalledWith(0.8)
    fireEvent.click(screen.getByRole('button', { name: 'Top view' }))
    expect(screen.getByLabelText('Scene state')).toHaveTextContent('Top camera')
    fireEvent.click(screen.getByRole('button', { name: 'Fit campus to view' }))
    expect(camera.overview).toHaveBeenCalledWith(true)
    fireEvent.click(screen.getByRole('button', { name: 'Focus selected place' }))
    expect(camera.focus).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'Show location labels' }))
    expect(screen.getByLabelText('Scene state')).toHaveTextContent('Labels hidden')
  })
})
