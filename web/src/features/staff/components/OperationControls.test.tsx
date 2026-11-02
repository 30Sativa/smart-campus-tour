import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { TourOperation } from '../../../api/contracts/staff'
import { OperationControls } from './OperationControls'
import { resetSim, tourById, tourView } from '../../../mocks/staff-sim'

// The command always succeeds here; this test is about what the panel offers next.
vi.mock('../staff-hooks', () => ({
  useTourCommand: () => ({
    isPending: false,
    mutate: (_: unknown, options?: { onSuccess?: () => void }) => options?.onSuccess?.(),
  }),
}))

function needingHelp(): TourOperation {
  resetSim()
  const base = tourView(tourById('tour-01')!)
  const open = { allowed: true, reason: null }
  return {
    ...base,
    operationalStatus: 'NeedsAssistance',
    reason: 'NavigationFailed',
    allowedActions: { ...base.allowedActions, retryLeg: open, endEarly: open },
  }
}

describe('OperationControls incident order', () => {
  it('lists the four incident steps in SRS order', () => {
    render(<OperationControls tour={needingHelp()} />)
    // The steps sit in a folded "Quy trình xử lý sự cố" section.
    fireEvent.click(screen.getByText('Quy trình xử lý sự cố'))
    const steps = within(screen.getByRole('list', { name: 'Trình tự xử lý sự cố' })).getAllByRole('listitem')
    expect(steps.map((item) => item.textContent)).toEqual([
      expect.stringContaining('Dừng an toàn'),
      expect.stringContaining('Chuyển fallback'),
      expect.stringContaining('Thử phục hồi một lần'),
      expect.stringContaining('Kết thúc sớm nếu chưa an toàn'),
    ])
  })

  it('allows one recovery attempt per incident, then points to End Early', () => {
    const tour = needingHelp()
    const { rerender } = render(<OperationControls tour={tour} />)
    fireEvent.click(screen.getByRole('button', { name: /Thử lại chặng/ }))
    const dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'Đã dọn vật cản' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Thử lại chặng' }))

    rerender(<OperationControls tour={tour} />)
    expect(screen.queryByRole('button', { name: /Thử lại chặng/ })).toBeNull()
    expect(screen.getByText(/Đã thử phục hồi một lần cho sự cố này/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Kết thúc sớm/ })).toBeEnabled()
  })

  it('offers a recovery again for a new incident', () => {
    const tour = needingHelp()
    const { rerender } = render(<OperationControls tour={tour} />)
    fireEvent.click(screen.getByRole('button', { name: /Thử lại chặng/ }))
    const dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'Đã dọn vật cản' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Thử lại chặng' }))

    rerender(<OperationControls tour={{ ...tour, operationalStatus: 'Normal', reason: null }} />)
    rerender(<OperationControls tour={tour} />)
    expect(screen.getByRole('button', { name: /Thử lại chặng/ })).toBeInTheDocument()
  })
})
