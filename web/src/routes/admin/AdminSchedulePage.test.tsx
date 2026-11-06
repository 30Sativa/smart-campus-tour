import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AdminSchedulePage from './AdminSchedulePage'

type Block = { id: string; scope: 'DAY' | 'SHIFT'; reason: string } | null
const shift = (date: string, code: string, name: string, open: string, close: string, block: Block) => ({
  code, name, startsAt: `${date}T${open}:00Z`, endsAt: `${date}T${close}:00Z`, tourStartsAt: `${date}T${open}:00Z`, time: '', maxDurationSeconds: 5400, block,
})
let blocks: Record<string, { S1: Block; S2: Block }> = {}
let refusal: { status: number; body: unknown } | null = null
let writes: Array<{ path: string; body: Record<string, unknown> }> = []

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
function days(from: string) {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(`${from}T00:00:00Z`)
    date.setUTCDate(date.getUTCDate() + index)
    const key = date.toISOString().slice(0, 10)
    return { date: key, shifts: [
      shift(key, 'S1', 'Ca sáng', '01:00', '03:00', blocks[key]?.S1 ?? null),
      shift(key, 'S2', 'Ca chiều 1', '06:00', '08:00', blocks[key]?.S2 ?? null),
    ] }
  })
}
const firstDate = () => new URL(String(vi.mocked(fetch).mock.calls[0][0]), 'http://localhost').searchParams.get('from')!
const show = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><MemoryRouter><AdminSchedulePage /></MemoryRouter></QueryClientProvider>)

describe('Admin operating calendar', () => {
  beforeEach(() => {
    blocks = {}
    refusal = null
    writes = []
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), 'http://localhost')
      if (init?.method === 'POST') {
        writes.push({ path: url.pathname, body: JSON.parse(String(init.body)) as Record<string, unknown> })
        if (refusal) return json(refusal.body, refusal.status)
        return json({ success: true, data: { id: 'new-block', scope: 'SHIFT', reason: 'x' } })
      }
      return json({ success: true, data: { days: days(url.searchParams.get('from')!), recommendedMaxSeconds: 3600 } })
    }))
  })
  afterEach(() => vi.unstubAllGlobals())

  it('closes one shift with a required reason', async () => {
    show()
    await screen.findByRole('table', { name: 'Lịch vận hành' })
    const date = firstDate()
    fireEvent.click(screen.getByRole('button', { name: `Khoá Ca sáng ${date}` }))
    const dialog = screen.getByRole('dialog')
    const confirm = within(dialog).getByRole('button', { name: 'Khoá' })
    expect(confirm).toBeDisabled()
    fireEvent.change(within(dialog).getByLabelText(/Lý do khoá/), { target: { value: 'Bảo trì robot' } })
    fireEvent.click(confirm)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(writes).toHaveLength(1)
    expect(writes[0]).toMatchObject({ path: '/api/admin/schedule-blocks', body: { date, shiftCode: 'S1', reason: 'Bảo trì robot' } })
    expect(writes[0].body.requestId).toEqual(expect.stringMatching(/^[0-9a-f-]{36}$/))
  })

  it('closes a whole day with a null shift', async () => {
    show()
    await screen.findByRole('table', { name: 'Lịch vận hành' })
    const date = firstDate()
    fireEvent.click(screen.getByRole('button', { name: `Khoá cả ngày ${date}` }))
    fireEvent.change(within(screen.getByRole('dialog')).getByLabelText(/Lý do khoá/), { target: { value: 'Nghỉ lễ' } })
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Khoá' }))
    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0].body).toMatchObject({ date, shiftCode: null, reason: 'Nghỉ lễ' })
  })

  it('names the Tours in the way when the shift still has some, and keeps the dialog open', async () => {
    refusal = { status: 409, body: { success: false, message: 'Còn 1 Tour chưa huỷ trong ca này. Staff cần huỷ Tour trước rồi mới khoá được.',
      errors: { code: 'SHIFT_HAS_TOURS', blockers: [{ code: 'tour-1', message: 'Tour sáng thứ Bảy (08:15 05/01/2099)' }] } } }
    show()
    await screen.findByRole('table', { name: 'Lịch vận hành' })
    fireEvent.click(screen.getByRole('button', { name: `Khoá Ca sáng ${firstDate()}` }))
    const dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText(/Lý do khoá/), { target: { value: 'Bảo trì' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Khoá' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Staff cần huỷ Tour trước')
    expect(within(within(dialog).getByRole('list', { name: 'Tour đang chiếm chỗ' })).getByText('Tour sáng thứ Bảy (08:15 05/01/2099)')).toBeInTheDocument()
    // Retrying the same content reuses the request id.
    const first = writes[0].body.requestId
    fireEvent.click(within(dialog).getByRole('button', { name: 'Khoá' }))
    await waitFor(() => expect(writes).toHaveLength(2))
    expect(writes[1].body.requestId).toBe(first)
  })

  it('reopens a closed shift, and a whole-day block is removed from the day column', async () => {
    const monday = (() => { const now = new Date(Date.now() + 7 * 3600_000); now.setUTCDate(now.getUTCDate() - ((now.getUTCDay() + 6) % 7)); return now.toISOString().slice(0, 10) })()
    const tuesday = new Date(`${monday}T00:00:00Z`); tuesday.setUTCDate(tuesday.getUTCDate() + 1)
    const nextDay = tuesday.toISOString().slice(0, 10)
    const day: Block = { id: 'day-block', scope: 'DAY', reason: 'Nghỉ lễ' }
    blocks = { [monday]: { S1: { id: 'shift-block', scope: 'SHIFT', reason: 'Bảo trì robot' }, S2: null }, [nextDay]: { S1: day, S2: day } }
    show()
    await screen.findByRole('table', { name: 'Lịch vận hành' })
    expect(screen.getByText('Bảo trì robot')).toBeInTheDocument()
    expect(screen.getAllByText('Khoá theo ngày')).toHaveLength(2)
    expect(screen.queryByRole('button', { name: `Khoá Ca sáng ${nextDay}` })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: `Gỡ khoá Ca sáng ${monday}` }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Gỡ khoá' }))
    await waitFor(() => expect(writes[0]?.path).toBe('/api/admin/schedule-blocks/shift-block/remove'))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: `Gỡ khoá cả ngày ${nextDay}` }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Gỡ khoá' }))
    await waitFor(() => expect(writes[1]?.path).toBe('/api/admin/schedule-blocks/day-block/remove'))
  })

  it('moves by week', async () => {
    show()
    await screen.findByRole('table', { name: 'Lịch vận hành' })
    const from = firstDate()
    fireEvent.click(screen.getByRole('button', { name: 'Tuần sau' }))
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.length).toBeGreaterThan(1))
    const next = new URL(String(vi.mocked(fetch).mock.calls.at(-1)![0]), 'http://localhost').searchParams.get('from')!
    expect(new Date(`${next}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()).toBe(7 * 86400_000)
  })
})
