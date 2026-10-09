import { useState } from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { FleetPanels, type FleetTab } from './FleetPanels'
import { createPatrol } from './patrol-demo'
vi.mock('./FleetCamera',()=>({FleetCamera:()=> <div>Camera scene</div>}))
function Harness({tab}:{tab:FleetTab}) {
  const [state,setState]=useState(()=>createPatrol()), [selected,setSelected]=useState(1)
  return <><div data-testid="fleet-state">{state.robots.map(r=>`R${r.number}:${r.mode}:${r.battery}:${r.queue.length}`).join(',')} · selected {selected} · clock {state.seconds}</div><FleetPanels tab={tab} state={state} setState={setState} selected={selected} setSelected={setSelected}/></>
}
describe('fleet operations panels',()=>{
  it('adds an explainable task and applies selected robot fault/recovery',()=>{
    const view=render(<Harness tab="tasks"/>)
    fireEvent.click(screen.getByRole('button',{name:'Giao nhiệm vụ'}))
    expect(within(screen.getByRole('list',{name:'Giải thích phân công'})).getByRole('listitem')).toHaveTextContent(/Điểm 1 → R\d:.*thấp nhất/)
    view.rerender(<Harness tab="scenarios"/>)
    fireEvent.change(screen.getByLabelText('Robot được chọn'),{target:{value:'4'}})
    fireEvent.click(screen.getByRole('button',{name:'Áp dụng kịch bản'}))
    expect(screen.getByTestId('fleet-state')).toHaveTextContent('R4:fault')
    fireEvent.change(screen.getByLabelText('Kịch bản thử nghiệm'),{target:{value:'recover'}})
    fireEvent.click(screen.getByRole('button',{name:'Áp dụng kịch bản'}))
    expect(screen.getByTestId('fleet-state')).toHaveTextContent('R4:moving')
  })
  it('answers a fleet question and lets the operator follow cited robots',()=>{
    render(<Harness tab="copilot"/>)
    fireEvent.click(screen.getByRole('button',{name:'Robot nào pin thấp?'}))
    expect(screen.getByText(/R6: 70%/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button',{name:/^R6$/}))
    expect(screen.getByTestId('fleet-state')).toHaveTextContent('selected 6')
    expect(screen.getByText(/chưa gọi LLM/)).toBeInTheDocument()
  })
  it('runs a real what-if comparison while leaving live robots untouched',async()=>{
    render(<Harness tab="whatif"/>)
    const before=screen.getByTestId('fleet-state').textContent
    fireEvent.click(screen.getByRole('button',{name:'Chạy so sánh'}))
    expect(screen.getByRole('button',{name:'Đang thử…'})).toBeDisabled()
    await waitFor(()=>expect(screen.getByText('Baseline')).toBeInTheDocument(),{timeout:15000})
    expect(screen.getByTestId('fleet-state').textContent).toBe(before)
    expect(screen.getByText(/Kịch bản · 1 seed/)).toBeInTheDocument()
  })
})
