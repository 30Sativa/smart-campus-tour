import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import StaffNarrationRehearsalPage from './StaffNarrationRehearsalPage'
import { useAuthStore } from '../../../stores/auth-store'

const revision = (name: string) => ({ id: `${name}-rev`, revisionNumber: 1, mapVersionId: 'map', mapKey: 'm', name, purpose: 'p', description: null, x: 0, y: 0, yaw: 0, cameraPreset: 'FRONT', createdAt: '2026-11-01T00:00:00Z', isSubmitted: true, submittedAt: null, navigationStatus: 'PASS', verificationSourceRevisionId: null })
const approvedSummary = { revisionNumber: 1, approvedByUserId: 'u2', approvedByName: 'Lan', approvedAt: '2026-11-15T02:00:00Z' }
const draftSummary = { revisionNumber: 2, lastEditedByUserId: 'u1', lastEditedByName: 'An', lastEditedAt: '2026-11-15T03:00:00Z', rowVersion: 'n' }
const proposals = [
  { id: 'p-both', currentRevision: 1, rowVersion: 'r', revision: revision('Thư viện'), narration: { approved: approvedSummary, draft: draftSummary } },
  { id: 'p-draft', currentRevision: 1, rowVersion: 'r', revision: revision('Sảnh'), narration: { approved: null, draft: draftSummary } },
  { id: 'p-none', currentRevision: 1, rowVersion: 'r', revision: revision('Bãi xe'), narration: null },
]
const version = (proposalId: string, revisionNumber: number, state: string, narrationText: string) => ({
  id: `${proposalId}-${revisionNumber}`, proposalId, revisionNumber, state, narrationText, fallbackVideoUrl: null,
  createdByUserId: 'u1', createdByName: 'An', createdAt: '2026-11-15T01:00:00Z', lastEditedByUserId: 'u1', lastEditedByName: 'An',
  lastEditedAt: '2026-11-15T01:00:00Z', approvedByUserId: null, approvedByName: null, approvedAt: null, rowVersion: 'n',
})
const narrations: Record<string, unknown[]> = {
  'p-both': [version('p-both', 2, 'DRAFT', 'Bản nháp thư viện.'), version('p-both', 1, 'APPROVED', 'Bản duyệt thư viện.')],
  'p-draft': [version('p-draft', 1, 'DRAFT', 'Bản nháp sảnh.')],
}
const ok = (data: unknown) => new Response(JSON.stringify({ success: true, data }), { status: 200, headers: { 'Content-Type': 'application/json' } })
const requested: string[] = []

describe('Staff narration rehearsal (ADR-0060)', () => {
  beforeEach(() => {
    requested.length = 0
    useAuthStore.setState({ accessToken: 't', isAuthenticated: true, isAuthReady: true, user: { userId: 'u1', username: 's', role: 'Staff' } })
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://localhost'); requested.push(url.pathname)
      if (url.pathname === '/api/staff/poi-proposals') return ok(proposals)
      const match = url.pathname.match(/^\/api\/staff\/poi-proposals\/([^/]+)\/narrations$/)
      if (match) return ok(narrations[match[1]] ?? [])
      return ok(null)
    }))
  })
  afterEach(() => { vi.unstubAllGlobals(); useAuthStore.getState().logout() })

  it('rehearses the approved text, falls back to a labelled draft, and leaves out a POI without narration', async () => {
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><StaffNarrationRehearsalPage /></MemoryRouter></QueryClientProvider>)
    const library = (await screen.findByRole('checkbox', { name: /Thư viện/ })).closest('label')!
    const hall = screen.getByRole('checkbox', { name: /Sảnh/ }).closest('label')!
    expect(within(library).queryByText('Bản nháp')).not.toBeInTheDocument()
    expect(within(hall).getByText('Bản nháp')).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /Bãi xe/ })).not.toBeInTheDocument()
    // Only POIs whose summary has a version are read; the text never comes from the POI revision.
    expect(requested).not.toContain('/api/staff/poi-proposals/p-none/narrations')

    // The robot "arrives" at the first stop after the travel delay; the live view then shows the approved text.
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      fireEvent.click(screen.getByRole('button', { name: 'Bắt đầu: robot đi tới điểm 1' }))
      await act(async () => { await vi.advanceTimersByTimeAsync(3100) })
      expect(screen.getAllByText('Bản duyệt thư viện.').length).toBeGreaterThan(0)
      expect(screen.queryByText('Bản nháp thư viện.')).not.toBeInTheDocument()
    } finally { vi.useRealTimers() }
  })
})
