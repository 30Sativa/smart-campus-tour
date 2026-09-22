import { act, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { usePagination } from './use-pagination'
import { Pagination } from './StaffUi'

const rows = Array.from({ length: 23 }, (_, i) => i + 1)

describe('client-side paging', () => {
  it('slices pages and starts again at page 1 when the filter changes', () => {
    const { result, rerender } = renderHook(({ key }) => usePagination(rows, 10, key), { initialProps: { key: 'a' } })
    expect(result.current.pageCount).toBe(3)
    act(() => result.current.setPage(3))
    expect(result.current.rows).toEqual([21, 22, 23])
    rerender({ key: 'b' })
    expect(result.current.page).toBe(1)
  })

  it('shows the range, marks the current page and hides itself for one page', () => {
    const pages: number[] = []
    const { rerender, container } = render(<Pagination page={2} pageCount={3} total={23} pageSize={10} onPage={(n) => pages.push(n)} label="Trang" />)
    expect(screen.getByText('11-20')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '2' })).toHaveAttribute('aria-current', 'page')
    fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }))
    expect(pages).toEqual([3])
    rerender(<Pagination page={1} pageCount={1} total={4} pageSize={10} onPage={() => {}} label="Trang" />)
    expect(container).toBeEmptyDOMElement()
  })
})
