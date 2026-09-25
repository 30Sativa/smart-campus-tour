/**
 * Labelled fixtures for administration: the app's only data source while
 * `/api/admin/*` does not exist (see `mock-mode.ts`). They implement the four
 * service types of `api/contracts/admin.ts` over `admin-sim.ts`, which shares
 * its world with the operations mock, so swapping to HTTP is one binding in
 * `features/administration/admin-hooks.ts`.
 *
 * Like a server would, every call checks the caller's role from the (mock)
 * token: only `Admin` passes. A refusal comes back as an `ApiError` whose body
 * is the JSON `AdminErrorBody` the real endpoints are expected to return.
 */
import { ApiError } from '../api/client'
import type { AdminInvitationService, AdminRegistrationService, AdminRouteService, AdminTourService } from '../api/contracts/admin'
import { isAdminRole } from '../auth/roles'
import { useAuthStore } from '../stores/auth-store'
import * as admin from './admin-sim'
import { mockDelay } from './mock-mode'
import { ensureRepresentativeSeed } from './representative-sim'

function actor() {
  return useAuthStore.getState().user?.username || 'admin'
}

async function call<T>(run: () => T): Promise<T> {
  try {
    ensureRepresentativeSeed()
    if (!isAdminRole(useAuthStore.getState().user?.role)) {
      throw new admin.AdminRejection(403, { code: 'NotAllowed', message: 'Chỉ Quản trị viên được thực hiện thao tác này.' })
    }
    const value = run()
    return await mockDelay(structuredClone(value))
  } catch (error) {
    await mockDelay(null)
    if (error instanceof admin.AdminRejection) throw new ApiError(error.status, JSON.stringify(error.body))
    throw error
  }
}

export const mockAdminTourService: AdminTourService = {
  list: (filters) => call(() => admin.listTours(filters)),
  get: (id) => call(() => admin.getTour(id)),
  create: (input, requestId) => call(() => admin.createTour(input, requestId, actor())),
  update: (id, input, version) => call(() => admin.updateTour(id, input, version, actor())),
  finalize: (id, version) => call(() => admin.finalizeTour(id, version, actor())),
  reopen: (id, version) => call(() => admin.reopenTour(id, version, actor())),
  cancel: (id, reason, version) => call(() => admin.cancelTour(id, reason, version, actor())),
}

export const mockAdminRegistrationService: AdminRegistrationService = {
  list: (filters) => call(() => admin.listRegistrations(filters)),
  get: (id) => call(() => admin.getRegistration(id)),
  approve: (id, version) => call(() => admin.approveRegistration(id, version, actor())),
  reject: (id, reason, version) => call(() => admin.rejectRegistration(id, reason, version, actor())),
}

export const mockAdminInvitationService: AdminInvitationService = {
  preview: (id) => call(() => admin.invitationPreview(id)),
  send: (id) => call(() => admin.sendInvitation(id, actor())),
}

export const mockAdminRouteService: AdminRouteService = {
  list: () => call(() => admin.listRoutes()),
}
