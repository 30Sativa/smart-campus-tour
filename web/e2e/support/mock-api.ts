import type { Page, Route } from '@playwright/test'
import { E2E_API_ORIGIN } from './constants'

export type AccountRole = 'Admin' | 'Staff' | 'Representative' | 'TechnicalStaff'

type Reply = { status?: number; json?: unknown; body?: string; raw?: Buffer; contentType?: string; hang?: boolean }
export type Handler = {
  method?: string
  /** Matched against `pathname + search` of the request. */
  path: RegExp | string
  reply: Reply | ((route: Route, url: URL, body: unknown) => Reply | Promise<Reply>)
}

/** The campus clock every scenario runs at: Friday 13/11/2026 09:00 in Hà Nội. */
export const NOW = new Date('2026-11-13T09:00:00+07:00')
export const at = (minutesFromNow: number) => new Date(NOW.getTime() + minutesFromNow * 60_000).toISOString()

function base64url(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

/** An unsigned JWT with the claims the backend issues. The app trusts the refresh response, never verifies it. */
export function fakeAccessToken(role: AccountRole, sub = `e2e-${role.toLowerCase()}`): string {
  const now = Math.floor(NOW.getTime() / 1000)
  return `${base64url({ alg: 'none', typ: 'JWT' })}.${base64url({
    sub, role, 'http://schemas.microsoft.com/ws/2008/06/identity/claims/role': role,
    iss: 'campustour-e2e', aud: 'campustour-web', iat: now, nbf: now, exp: now + 15 * 60,
  })}.`
}

export const ACCOUNTS: Record<AccountRole, { userId: string; username: string }> = {
  Admin: { userId: 'e2e-admin', username: 'admin.e2e' },
  Staff: { userId: 'e2e-staff', username: 'staff.e2e' },
  Representative: { userId: 'e2e-representative', username: 'daidien.e2e' },
  TechnicalStaff: { userId: 'e2e-technical', username: 'kythuat.e2e' },
}

export const ok = <T>(data: T, message: string | null = null) => ({ success: true, message, data, errors: null })
export const paged = <T>(data: T[], page = 1, pageSize = 20) => ({
  success: true, message: null, data, errors: null,
  pagination: { page, pageSize, totalItems: data.length, totalPages: Math.max(1, Math.ceil(data.length / pageSize)) },
})

export type MockApi = { unhandled: string[]; requests: string[] }

/**
 * Answer every request to the fake API origin from `handlers` (first match wins).
 * Anything unmatched gets a 404 and is recorded, so a scenario can report which
 * calls it did not anticipate. Requests to any other non-local host are aborted.
 */
export type MockOptions = {
  /** Serve `/hubs/operations` over a fake SignalR WebSocket and push this `FleetUpdated` payload. Unset: the hub is down. */
  fleet?: unknown[]
}

const RS = ''

export async function mockApi(page: Page, role: AccountRole | null, handlers: Handler[], options: MockOptions = {}): Promise<MockApi> {
  const log: MockApi = { unhandled: [], requests: [] }
  await page.clock.install({ time: NOW })
  const auth: Handler[] = [
    {
      method: 'POST', path: '/api/auth/refresh',
      reply: role
        ? { json: { accessToken: fakeAccessToken(role), ...ACCOUNTS[role], role } }
        : { status: 401, json: { success: false, message: 'No session', data: null, errors: null } },
    },
    { method: 'POST', path: '/api/auth/logout', reply: { status: 204 } },
    options.fleet
      ? { method: 'POST', path: /^\/hubs\/operations\/negotiate/, reply: { json: {
        negotiateVersion: 1, connectionId: 'e2e', connectionToken: 'e2e',
        availableTransports: [{ transport: 'WebSockets', transferFormats: ['Text', 'Binary'] }],
      } } }
      // No hub: negotiate fails and the page must cope.
      : { path: /^\/hubs\//, reply: { status: 503, body: 'realtime disabled in e2e' } },
  ]
  const all = [...auth, ...handlers]
  await page.route(`${E2E_API_ORIGIN}/**`, async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const target = url.pathname + url.search
    const method = request.method()
    log.requests.push(`${method} ${target}`)
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: cors(request.headers().origin) })
    const handler = all.find((h) => (!h.method || h.method === method)
      && (typeof h.path === 'string' ? url.pathname === h.path : h.path.test(target)))
    if (!handler) {
      log.unhandled.push(`${method} ${target}`)
      return route.fulfill({ status: 404, headers: cors(request.headers().origin), contentType: 'application/json',
        body: JSON.stringify({ success: false, message: 'Not mocked', data: null, errors: null }) })
    }
    let body: unknown = null
    try { body = request.postDataJSON() } catch { body = request.postData() }
    const reply = typeof handler.reply === 'function' ? await handler.reply(route, url, body) : handler.reply
    if (reply.hang) return // never answered: the page has to give up on its own
    await route.fulfill({
      status: reply.status ?? 200,
      headers: cors(request.headers().origin),
      contentType: reply.contentType ?? 'application/json',
      body: reply.raw ?? reply.body ?? (reply.json === undefined ? '' : JSON.stringify(reply.json)),
    })
  })
  if (options.fleet) {
    const fleet = options.fleet
    // SignalR JSON protocol: answer the handshake, then push one FleetUpdated and keep the connection alive.
    await page.routeWebSocket(/\/hubs\/operations/, (ws) => {
      ws.onMessage((message) => {
        if (typeof message !== 'string' || !message.includes('"protocol"')) return
        ws.send(`{}${RS}`)
        ws.send(JSON.stringify({ type: 1, target: 'FleetUpdated', arguments: [fleet] }) + RS)
      })
      const ping = setInterval(() => ws.send(`{"type":6}${RS}`), 10_000)
      ws.onClose(() => clearInterval(ping))
    })
  }
  // Nothing leaves the machine: block every other non-local origin (fonts, video, WHEP).
  await page.route(/^https?:\/\/(?!localhost[:/]|127\.0\.0\.1[:/]|api\.e2e\.invalid[:/])/, (route) => route.abort())
  return log
}

function cors(origin: string | undefined) {
  return {
    'Access-Control-Allow-Origin': origin ?? '*',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': 'authorization, content-type, x-requested-with, x-signalr-user-agent',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  }
}
