import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RobotFlowSection } from './RobotFlowSection'
import { FLOWS } from '../robot-explode/flows'

const now = () => screen.getByText(/Đang chạy/).parentElement

describe('RobotFlowSection', () => {
  it('lists the driving steps first and opens the first one', () => {
    render(<RobotFlowSection />)
    expect(screen.getByRole('tab', { name: /Di chuyển/ })).toHaveAttribute('aria-selected', 'true')
    const steps = within(screen.getByRole('list', { name: /Các bước: Di chuyển/ })).getAllByRole('heading', { level: 3 })
    expect(steps.map(step => step.textContent)).toEqual(FLOWS[0].steps.map((step, index) => `Bước ${index + 1}/${FLOWS[0].steps.length}: ${step.title}`))
    expect(screen.getByText('Mini PC → STM32G431')).toBeInTheDocument()
    expect(screen.queryByText('Driver HBS86H ×2 → Động cơ 57HS22 ×2')).not.toBeInTheDocument()
  })

  it('moves through the steps with the buttons, then on to the next function', () => {
    render(<RobotFlowSection />)
    // Before the first step of the first function comes the last function.
    expect(screen.getByRole('button', { name: 'Về Nguồn điện' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Bước tiếp' }))
    fireEvent.click(screen.getByRole('button', { name: 'Bước tiếp' }))
    expect(now()).toHaveTextContent('Di chuyển · Động cơ quay bánh xe')
    expect(screen.getByText('Driver HBS86H ×2 → Động cơ 57HS22 ×2')).toBeInTheDocument()
    expect(screen.getByText('Bước 3/3', { selector: '.lp3-flow__count' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Tiếp: Cảm biến & định vị' }))
    expect(screen.getByRole('tab', { name: /Cảm biến/ })).toHaveAttribute('aria-selected', 'true')
    expect(now()).toHaveTextContent('Cảm biến & định vị · LiDAR quét quanh robot')
    fireEvent.click(screen.getByRole('button', { name: 'Về Di chuyển' }))
    expect(now()).toHaveTextContent('Di chuyển · Động cơ quay bánh xe')
    fireEvent.click(screen.getByRole('button', { name: 'Bước trước' }))
    expect(now()).toHaveTextContent('Di chuyển · Mạch điều khiển phát xung')
  })

  it('also steps with the arrow keys', () => {
    render(<RobotFlowSection />)
    const list = screen.getByRole('list', { name: /Các bước: Di chuyển/ })
    fireEvent.keyDown(list, { key: 'ArrowRight' })
    expect(now()).toHaveTextContent('Di chuyển · Mạch điều khiển phát xung')
    fireEvent.keyDown(list, { key: 'ArrowLeft' })
    expect(now()).toHaveTextContent('Di chuyển · Máy tính gửi lệnh tốc độ')
  })

  it('switches to another function and starts it at its first step', () => {
    render(<RobotFlowSection />)
    fireEvent.click(screen.getByRole('tab', { name: /Nguồn hình/ }))
    expect(screen.getByRole('tab', { name: /Nguồn hình/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('list', { name: /Các bước: Nguồn hình/ })).toBeInTheDocument()
    expect(now()).toHaveTextContent('Nguồn hình · Kính ghi lại góc nhìn')
  })

  it('opens the signal detail of a step and jumps to a step from its dot or its title', () => {
    render(<RobotFlowSection />)
    const more = screen.getByRole('button', { name: /Chi tiết tín hiệu/ })
    expect(more).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(more)
    expect(more).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText(/CMD,<seq>/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Bước 3: Động cơ quay bánh xe' }))
    expect(screen.getByRole('button', { name: 'Bước 3: Động cơ quay bánh xe' })).toHaveAttribute('aria-current', 'step')
    expect(now()).toHaveTextContent('Di chuyển · Động cơ quay bánh xe')
    fireEvent.click(screen.getByRole('button', { name: /Bước 2\/3:\s*Mạch điều khiển phát xung/ }))
    expect(now()).toHaveTextContent('Di chuyển · Mạch điều khiển phát xung')
  })
})
