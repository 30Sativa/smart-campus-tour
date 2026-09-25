/**
 * Labelled fixture for the representative area: the only data source while
 * `/api/representative/*` does not exist (see `mock-mode.ts`). Implements
 * `RepresentativeService` over `representative-sim.ts`, which shares its world
 * with the Admin and Staff mocks.
 *
 * Like a server would, every call checks the caller's role from the (mock)
 * token and scopes the data to that account.
 */
import { ApiError } from '../api/client'
import type { RepresentativeService } from '../api/contracts/representative'
import { isRepresentativeRole } from '../auth/roles'
import { useAuthStore } from '../stores/auth-store'
import { mockDelay } from './mock-mode'
import * as rep from './representative-sim'

function owner(): string {
  const user = useAuthStore.getState().user
  if (!user || !isRepresentativeRole(user.role)) {
    throw new rep.RepresentativeRejection(403, { code: 'NotAllowed', message: 'Chỉ tài khoản đại diện trường được thực hiện thao tác này.' })
  }
  return user.userId
}

async function call<T>(run: (ownerId: string) => T): Promise<T> {
  try {
    const value = run(owner())
    return await mockDelay(structuredClone(value))
  } catch (error) {
    await mockDelay(null)
    if (error instanceof rep.RepresentativeRejection) throw new ApiError(error.status, JSON.stringify(error.body))
    throw error
  }
}

export const mockRepresentativeService: RepresentativeService = {
  listTours: () => call((o) => rep.listTours(o)),
  getTour: (id) => call((o) => rep.getTour(id, o)),
  listRegistrations: () => call((o) => rep.listRegistrations(o)),
  getRegistration: (id) => call((o) => rep.getRegistration(id, o)),
  submit: (tourId, input, requestId) => call((o) => rep.submit(tourId, input, requestId, o)),
  update: (id, input, version) => call((o) => rep.update(id, input, version, o)),
  cancel: (id, version) => call((o) => rep.cancel(id, version, o)),
}

/** Pre-fill for the registration form of the signed-in account. */
export function currentRepresentativeProfile() {
  const user = useAuthStore.getState().user
  return rep.profileFor(user?.userId ?? '')
}
