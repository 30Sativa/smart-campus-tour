import { describe, expect, it } from 'vitest'
import { AREAS, ALL_ROLES, areaById, landingPathAfterLogin, roleRow } from './access'
import { homePathForRole, isAdminRole, isStaffRole, normalizeRole } from './roles'

/**
 * The access rules are the one thing in this refactor that is a security
 * boundary rather than a layout choice, so they are tested directly rather than
 * through a screen.
 */
describe('area access', () => {
  it('has exactly four sign-in roles and no visitor area', () => {
    expect([...ALL_ROLES]).toEqual(['Staff', 'Admin', 'Representative', 'TechnicalStaff'])
    expect(AREAS.map((area) => area.id)).toEqual(['public', 'staff', 'admin', 'representative', 'technical'])
  })

  // SRS v1.9 demo acceptance 6: only Technical Staff records technical confirmation.
  it('keeps the technical area to Technical Staff only', () => {
    expect(areaById('technical').allows('TechnicalStaff')).toBe(true)
    expect(areaById('technical').allows('technical_staff')).toBe(true)
    for (const role of ['Staff', 'Admin', 'Representative', undefined]) expect(areaById('technical').allows(role)).toBe(false)
    expect(areaById('staff').allows('TechnicalStaff')).toBe(false)
    expect(areaById('admin').allows('TechnicalStaff')).toBe(false)
    expect(homePathForRole('TechnicalStaff')).toBe('/technical')
    expect(landingPathAfterLogin('TechnicalStaff', '/technical/confirmations')).toBe('/technical/confirmations')
    expect(landingPathAfterLogin('TechnicalStaff', '/staff')).toBe('/technical')
  })

  // Representative added with the registration area (flow review 21/09/2026 §4).
  it('keeps the representative area to representatives only', () => {
    expect(areaById('representative').allows('Representative')).toBe(true)
    expect(areaById('representative').allows('daidien')).toBe(true)
    for (const role of ['Staff', 'Admin', undefined]) expect(areaById('representative').allows(role)).toBe(false)
    expect(areaById('admin').allows('Representative')).toBe(false)
    expect(areaById('staff').allows('Representative')).toBe(false)
    expect(homePathForRole('Representative')).toBe('/dai-dien')
    expect(landingPathAfterLogin('Representative', '/dai-dien/dang-ky')).toBe('/dai-dien/dang-ky')
    expect(landingPathAfterLogin('Representative', '/admin')).toBe('/dai-dien')
  })

  it('keeps an unknown role out of every signed-in area', () => {
    for (const area of ['staff', 'admin', 'representative', 'technical'] as const) expect(areaById(area).allows('Visitor')).toBe(false)
    expect(areaById('staff').allows(undefined)).toBe(false)
    expect(areaById('admin').allows(null)).toBe(false)
    expect(areaById('public').allows(undefined)).toBe(true)
  })

  it('keeps staff out of administration', () => {
    expect(areaById('staff').allows('Staff')).toBe(true)
    expect(areaById('admin').allows('Staff')).toBe(false)
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
    // Anything unrecognised has no role, never an accidental staff member.
    expect(normalizeRole('superuser')).toBeNull()
    expect(normalizeRole('Visitor')).toBeNull()
    expect(isStaffRole('superuser')).toBe(false)
  })

  it('lands each role in its own area after sign-in', () => {
    expect(homePathForRole('Admin')).toBe('/admin')
    expect(homePathForRole('Staff')).toBe('/staff')
    expect(homePathForRole('CampusStaff')).toBe('/staff')
    expect(homePathForRole('Visitor')).toBe('/')
    expect(homePathForRole(undefined)).toBe('/')
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
      expect(landingPathAfterLogin('Visitor', '/staff')).toBe('/')
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
