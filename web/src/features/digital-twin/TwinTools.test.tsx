import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { TwinTools, type TwinTool } from './TwinTools'

function Tools() {
  const [tool, setTool] = useState<TwinTool>('select'), [routes, setRoutes] = useState(true), [labels, setLabels] = useState(false)
  return <TwinTools tool={tool} onTool={setTool} routes={routes} onRoutes={() => setRoutes(v => !v)} labels={labels} onLabels={() => setLabels(v => !v)} />
}
it('switches select, pan and measurement while keeping route and point toggles independent', () => {
  render(<Tools />)
  fireEvent.click(screen.getByRole('button', { name: 'Di chuyển bản đồ' }))
  expect(screen.getByRole('button', { name: 'Di chuyển bản đồ' })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByRole('button', { name: 'Chọn robot' })).toHaveAttribute('aria-pressed', 'false')
  fireEvent.click(screen.getByRole('button', { name: 'Đo khoảng cách' }))
  expect(screen.getByText(/Nhấn hai điểm/)).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Hiện điểm point' }))
  fireEvent.click(screen.getByRole('button', { name: 'Hiện tuyến đường' }))
  expect(screen.getByRole('button', { name: 'Hiện điểm point' })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByRole('button', { name: 'Hiện tuyến đường' })).toHaveAttribute('aria-pressed', 'false')
  expect(screen.getByRole('button', { name: 'Đo khoảng cách' })).toHaveAttribute('aria-pressed', 'true')
  fireEvent.click(screen.getByRole('button', { name: 'Đo khoảng cách' }))
  expect(screen.getByRole('button', { name: 'Chọn robot' })).toHaveAttribute('aria-pressed', 'true')
})
