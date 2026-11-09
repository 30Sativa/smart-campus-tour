import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RobotFlowSection, SignalDiagram } from './RobotFlowSection'
import { FLOWS } from '../robot-explode/flows'

describe('RobotFlowSection', () => {
  it('lists the driving steps first, from the mini PC down to the motors', () => {
    render(<RobotFlowSection />)
    expect(screen.getByRole('tab', { name: /Di chuyển/ })).toHaveAttribute('aria-selected', 'true')
    const steps = within(screen.getByRole('list', { name: /Các bước: Di chuyển/ })).getAllByRole('heading', { level: 3 })
    expect(steps.map(step => step.textContent)).toEqual(FLOWS[0].steps.map((step, index) => `Bước ${index + 1}/${FLOWS[0].steps.length}: ${step.title}`))
    expect(screen.getByText('Mini PC → STM32G431')).toBeInTheDocument()
    expect(screen.getByText('Driver HBS86H ×2 → Động cơ 57HS22 ×2')).toBeInTheDocument()
  })

  it('switches to another function and starts it at its first step', () => {
    render(<RobotFlowSection />)
    fireEvent.click(screen.getByRole('tab', { name: /Nguồn hình/ }))
    expect(screen.getByRole('tab', { name: /Nguồn hình/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('list', { name: /Các bước: Nguồn hình/ })).toBeInTheDocument()
    expect(screen.getByText(/Đang chạy/).parentElement).toHaveTextContent('Nguồn hình · Kính ghi lại góc nhìn')
  })

  it('opens the signal detail of a step and moves the robot to a step from its dot', () => {
    render(<RobotFlowSection />)
    const [first] = screen.getAllByRole('button', { name: /Chi tiết tín hiệu/ })
    expect(first).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(first)
    expect(first).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText(/CMD,<seq>/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Bước 3: Động cơ quay bánh xe' }))
    expect(screen.getByRole('button', { name: 'Bước 3: Động cơ quay bánh xe' })).toHaveAttribute('aria-current', 'step')
    expect(screen.getByText(/Đang chạy/).parentElement).toHaveTextContent('Di chuyển · Động cơ quay bánh xe')
  })

  it('draws the links of the step on the diagram and lights both ends', () => {
    const { container } = render(<SignalDiagram step={FLOWS[0].steps[1]} />)
    expect(screen.getByRole('img')).toHaveAccessibleName('Sơ đồ tín hiệu: STM32G431 tới Driver HBS86H ×2')
    expect(container.querySelectorAll('.lp3-flow__wire--on')).toHaveLength(1)
    const lit = [...container.querySelectorAll('.lp3-flow__node[data-on="true"] .lp3-flow__node-label')].map(node => node.textContent)
    expect(lit.sort()).toEqual(['Driver HBS86H ×2', 'STM32G431'])
  })
})
