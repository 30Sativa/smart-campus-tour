import { describe, expect, it } from 'vitest'
import { AREAS, ALL_ROLES, areaById, landingPathAfterLogin, roleRow } from './access'
import { homePathForRole, isAdminRole, isStaffRole, normalizeRole } from './roles'

/**
 * The access rules are the one thing in this refactor that is a security
 * boundary rather than a layout choice, so they are tested directly rather than
 * through a screen.
 */
describe('area access', () => {
  it('has exactly three roles', () => {
    expect([...ALL_ROLES]).toEqual(['Visitor', 'Staff', 'Admin'])
  })

  it('keeps a visitor out of operations and administration', () => {
    expect(areaById('staff').allows('Visitor')).toBe(false)
    expect(areaById('admin').allows('Visitor')).toBe(false)
    expect(areaById('staff').allows(undefined)).toBe(false)
    expect(areaById('admin').allows(null)).toBe(false)
    expect(areaById('public').allows(undefined)).toBe(true)
  })

  it('keeps staff out of administration', () => {
    expect(areaById('staff').allows('Staff')).toBe(true)
    expect(areaById('admin').allows('Staff')).toBe(false)
  })

  it('allows signed-in roles to browse the visitor area', () => {
    for (const role of ALL_ROLES) expect(areaById('visitor').allows(role)).toBe(true)
    expect(landingPathAfterLogin('Visitor', '/visit/map?destination=library')).toBe('/visit/map?destination=library')
  })

  it('lets an admin into both, which is the policy this app has always had', () => {
    expect(areaById('staff').allows('Admin')).toBe(true)
    expect(areaById('admin').allows('Admin')).toBe(true)
  })

  it('reads a token minted before the two operations roles were merged', () => {
    for (const legacy of ['CampusStaff', 'TourOperator', 'campus_staff', 'tour_operator', 'operator', 'ops', 'staff']) {
      expect(normalizeRole(legacy)).toBe('Staff')
      expect(isStaffRole(legacy)).toBe(true)
      expect(isAdminRole(legacy)).toBe(false)
    }
    expect(normalizeRole('administrator')).toBe('Admin')
    expect(isAdminRole('admin')).toBe(true)
    // Anything unrecognised is a visitor, never an accidental staff member.
    expect(normalizeRole('superuser')).toBe('Visitor')
    expect(isStaffRole('superuser')).toBe(false)
  })

  it('lands each role in its own area after sign-in', () => {
    expect(homePathForRole('Admin')).toBe('/admin')
    expect(homePathForRole('Staff')).toBe('/staff')
    expect(homePathForRole('CampusStaff')).toBe('/staff')
    expect(homePathForRole('Visitor')).toBe('/visit')
    expect(homePathForRole(undefined)).toBe('/visit')
  })

  describe('landing after sign-in', () => {
    it('sends an admin to administration even after being bounced off an operations page', () => {
      // The bug this covers: Admin may open /staff, so nothing forwarded them
      // on, and signing in from a blocked /staff visit left them on the
      // operations console with the admin dashboard nowhere in sight.
      expect(landingPathAfterLogin('Admin', '/staff')).toBe('/admin')
      expect(landingPathAfterLogin('Admin', '/staff/alerts')).toBe('/admin')
    })

    it('still returns an admin to the administration page they asked for', () => {
      expect(landingPathAfterLogin('Admin', '/admin/roles')).toBe('/admin/roles')
    })

    it('returns staff to the operations page they asked for', () => {
      expect(landingPathAfterLogin('Staff', '/staff/alerts')).toBe('/staff/alerts')
    })

    it('ignores a destination the role does not belong in', () => {
      expect(landingPathAfterLogin('Staff', '/admin')).toBe('/staff')
      expect(landingPathAfterLogin('Visitor', '/staff')).toBe('/visit')
    })

    it('falls back to the role home when there is nothing remembered', () => {
      expect(landingPathAfterLogin('Admin', undefined)).toBe('/admin')
      expect(landingPathAfterLogin('Staff', null)).toBe('/staff')
      // Not a path: never trusted as a redirect target.
      expect(landingPathAfterLogin('Admin', 'https://example.com')).toBe('/admin')
    })
  })

  it('builds the permission matrix from the same predicate the guard uses', () => {
    for (const role of ALL_ROLES) {
      const row = roleRow(role)
      expect(row.areas).toHaveLength(AREAS.length)
      row.areas.forEach((cell, index) => {
        expect(cell.allowed).toBe(AREAS[index].allows(role))
      })
    }
  })
})
