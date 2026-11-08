import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { RouteMap } from './RouteMap'

vi.mock('../pois/map/use-map-raster', () => ({ useMapRaster: () => ({ map: { width: 100, height: 100, resolution: 0.05, origin: [0, 0, 0], imageUrl: 'map.png' }, error: null, retry: () => {} }) }))

const stop = { id: 's1', name: 'Thư viện', x: 1, y: 1 }

describe('RouteMap legend', () => {
  it('lists nothing that is not drawn', () => {
    render(<RouteMap mapVersionId="m" stops={[]} />)
    expect(screen.queryByText('B: điểm bắt đầu')).not.toBeInTheDocument()
    expect(screen.queryByText('Điểm dừng theo thứ tự')).not.toBeInTheDocument()
    expect(screen.queryByText('K: điểm kết thúc')).not.toBeInTheDocument()
    expect(screen.queryByText(/Đường nối/)).not.toBeInTheDocument()
  })

  it('lists the start, stops and line once they are drawn', () => {
    render(<RouteMap mapVersionId="m" stops={[stop]} start={{ x: 0, y: 0 }} />)
    expect(screen.getByText('B: điểm bắt đầu')).toBeInTheDocument()
    expect(screen.getByText('Điểm dừng theo thứ tự')).toBeInTheDocument()
    expect(screen.getByText(/Đường nối/)).toBeInTheDocument()
    expect(screen.queryByText('K: điểm kết thúc')).not.toBeInTheDocument()
  })
})
