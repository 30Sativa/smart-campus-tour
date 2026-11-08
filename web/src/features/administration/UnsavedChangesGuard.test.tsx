import { fireEvent, render, screen } from '@testing-library/react'
import { Link, RouterProvider, createMemoryRouter, useNavigate } from 'react-router'
import { describe, expect, it } from 'vitest'
import { AFTER_SAVE } from './after-save'
import { UnsavedChangesGuard } from './UnsavedChangesGuard'

function Form({ dirty }: { dirty: boolean }) {
  const navigate = useNavigate()
  return <>
    <UnsavedChangesGuard when={dirty} />
    <Link to="/list">Danh sách</Link>
    <button type="button" onClick={() => navigate('/list', AFTER_SAVE)}>Lưu</button>
  </>
}

const show = (dirty: boolean) => render(<RouterProvider router={createMemoryRouter([
  { path: '/form', element: <Form dirty={dirty} /> },
  { path: '/list', element: <p>Trang danh sách</p> },
], { initialEntries: ['/form'] })} />)

describe('UnsavedChangesGuard', () => {
  it('asks before leaving with unsaved changes and stays on Cancel', async () => {
    show(true)
    fireEvent.click(screen.getByRole('link', { name: 'Danh sách' }))
    expect(await screen.findByRole('dialog', { name: 'Rời trang khi chưa lưu?' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Hủy|Huỷ|Quay lại|Ở lại/ }))
    expect(screen.queryByText('Trang danh sách')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('link', { name: 'Danh sách' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Rời trang' }))
    expect(await screen.findByText('Trang danh sách')).toBeInTheDocument()
  })

  it('lets the move after a save through, and never asks without changes', async () => {
    show(true)
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }))
    expect(await screen.findByText('Trang danh sách')).toBeInTheDocument()
  })

  it('registers the browser prompt only while there are changes', () => {
    const { unmount } = show(true)
    const event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    unmount()
    show(false)
    const clean = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(clean)
    expect(clean.defaultPrevented).toBe(false)
  })
})
