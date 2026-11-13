import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { EmptyState } from './EmptyState'

describe('EmptyState', () => {
  it('says there is nothing yet and offers the next step', () => {
    render(<EmptyState variant="empty" title="Chưa có Tour nào hôm nay" description="Tour mới sẽ hiện ở đây." action={<a href="/staff/schedule">Xem lịch</a>} />)
    const box = screen.getByRole('status')
    expect(box).toHaveTextContent('Chưa có Tour nào hôm nay')
    expect(box).toHaveTextContent('Tour mới sẽ hiện ở đây.')
    expect(screen.getByRole('link', { name: 'Xem lịch' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Xóa bộ lọc' })).not.toBeInTheDocument()
  })

  it('says a search or filter hid every row, with a way to clear it', () => {
    const onClear = vi.fn()
    render(<EmptyState variant="noMatch" onClear={onClear} />)
    expect(screen.getByRole('status')).toHaveTextContent('Không có kết quả phù hợp')
    expect(screen.getByRole('status')).toHaveTextContent('Thử từ khóa khác hoặc bỏ bớt bộ lọc.')
    fireEvent.click(screen.getByRole('button', { name: 'Xóa bộ lọc' }))
    expect(onClear).toHaveBeenCalledOnce()
  })

  it('lets a screen word its own no-match message', () => {
    render(<EmptyState variant="noMatch" title="Không có Tour khớp với “abc”" />)
    expect(screen.getByRole('status')).toHaveTextContent('Không có Tour khớp với “abc”')
  })

  it('uses the muted text class for the supporting line', () => {
    render(<EmptyState variant="empty" title="Chưa có robot" description="Kỹ thuật thêm robot." />)
    expect(screen.getByText('Kỹ thuật thêm robot.')).toHaveClass('text-muted')
  })
})
