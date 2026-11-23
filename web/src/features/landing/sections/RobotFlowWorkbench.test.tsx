import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, useLocation, useNavigate } from 'react-router'
import { describe, expect, it } from 'vitest'
import { FLOWS, parseBody } from '../robot-explode/flows'
import { RobotFlowWorkbench } from './RobotFlowWorkbench'

function History() {
  const location = useLocation()
  const navigate = useNavigate()
  return <><output aria-label="Địa chỉ">{location.search}</output><button onClick={() => navigate(-1)}>Quay lại</button></>
}

function open(query = '') {
  return render(<MemoryRouter initialEntries={[`/ben-trong-robot${query}`]}><RobotFlowWorkbench /><History /></MemoryRouter>)
}

describe('RobotFlowWorkbench', () => {
  it('keeps all five functions and every source step, with signal detail on demand', () => {
    open()
    expect(screen.getAllByRole('tab')).toHaveLength(FLOWS.length)
    for (const flow of FLOWS) {
      fireEvent.click(screen.getByRole('tab', { name: flow.label }))
      const buttons = within(screen.getByRole('group', { name: 'Chọn bước' })).getAllByRole('button')
      expect(buttons).toHaveLength(flow.steps.length)
      flow.steps.forEach((step, index) => {
        fireEvent.click(buttons[index])
        expect(buttons[index]).toHaveAttribute('aria-current', 'step')
        expect(screen.getByRole('heading', { level: 4 })).toHaveTextContent(step.title)
        expect(document.querySelector('.ri-body')).toHaveTextContent(parseBody(step.body).map(part => part.text).join(''))
        expect(screen.queryByText(step.signal)).not.toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Chi tiết tín hiệu' }))
        expect(screen.getByText(step.signal)).toBeInTheDocument()
      })
    }
  })

  it('moves to the next function and wraps backwards to the previous final step', () => {
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Bước trước' }))
    expect(screen.getByRole('tab', { name: 'Nguồn điện' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('heading', { level: 4 })).toHaveTextContent(FLOWS.at(-1)!.steps.at(-1)!.title)
    fireEvent.click(screen.getByRole('button', { name: 'Chức năng tiếp' }))
    expect(screen.getByRole('tab', { name: 'Di chuyển' })).toHaveAttribute('aria-selected', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Bước tiếp' }))
    expect(screen.getByRole('heading', { level: 4 })).toHaveTextContent(FLOWS[0].steps[1].title)
  })

  it('restores a linked step, preserves unrelated parameters and supports browser history', async () => {
    open('?flow=power&step=2&from=technology')
    expect(screen.getByRole('heading', { level: 4 })).toHaveTextContent(FLOWS[4].steps[1].title)
    fireEvent.click(screen.getByRole('button', { name: 'Bước tiếp' }))
    expect(screen.getByRole('status', { name: 'Địa chỉ' })).toHaveTextContent('flow=power&step=3&from=technology')
    fireEvent.click(screen.getByRole('button', { name: 'Quay lại' }))
    await waitFor(() => expect(screen.getByRole('heading', { level: 4 })).toHaveTextContent(FLOWS[4].steps[1].title))
  })

  it('clamps invalid URL selections instead of showing an empty panel', () => {
    const first = open('?flow=unknown&step=-10')
    expect(screen.getByRole('heading', { level: 4 })).toHaveTextContent(FLOWS[0].steps[0].title)
    first.unmount()
    open('?flow=drive&step=999')
    expect(screen.getByRole('heading', { level: 4 })).toHaveTextContent(FLOWS[0].steps.at(-1)!.title)
  })

  it('uses arrow keys for tabs and steps, and closes detail after switching', () => {
    open()
    const drive = screen.getByRole('tab', { name: 'Di chuyển' })
    fireEvent.keyDown(drive, { key: 'ArrowRight' })
    expect(screen.getByRole('tab', { name: 'Cảm biến & định vị' })).toHaveFocus()
    fireEvent.keyDown(screen.getByRole('tabpanel'), { key: 'ArrowRight' })
    expect(screen.getByRole('heading', { level: 4 })).toHaveTextContent(FLOWS[1].steps[1].title)
    fireEvent.click(screen.getByRole('button', { name: 'Chi tiết tín hiệu' }))
    fireEvent.click(screen.getByRole('tab', { name: 'Nguồn hình' }))
    expect(screen.getByRole('button', { name: 'Chi tiết tín hiệu' })).toHaveAttribute('aria-expanded', 'false')
  })

  it('opens as section 02 of the inside page, under its own heading', () => {
    open()
    expect(screen.getByRole('region', { name: /Chọn chức năng/ })).toHaveAttribute('id', 'cach-hoat-dong')
    expect(screen.getByText('02 / Cách hoạt động')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: FLOWS[0].label })).toBeInTheDocument()
  })

  it('can pause and resume the simulation', () => {
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Tạm dừng' }))
    expect(screen.getByRole('button', { name: 'Phát mô phỏng' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Phát mô phỏng' }))
    expect(screen.getByRole('button', { name: 'Tạm dừng' })).toHaveAttribute('aria-pressed', 'false')
  })
})
