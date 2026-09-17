import { describe, expect, it } from 'vitest'
import { AREAS, ALL_ROLES, areaById, roleRow } from './access'
import { homePathForRole, isAdminRole, isStaffRole, normalizeRole } from './roles'

/**
 * The access rules are the one thing in this refactor that is a security
 * boundary rather than a layout choice, so they are tested directly rather than
 * through a screen.
 */
describe('area access', () => {
  it('keeps a visitor out of both signed-in areas', () => {
    expect(areaById('staff').allows('Visitor')).toBe(false)
    expect(areaById('admin').allows('Visitor')).toBe(false)
    expect(areaById('staff').allows(undefined)).toBe(false)
    expect(areaById('admin').allows(null)).toBe(false)
    expect(areaById('public').allows(undefined)).toBe(true)
  })

  it('keeps an operator out of administration', () => {
    for (const role of ['TourOperator', 'CampusStaff']) {
      expect(areaById('staff').allows(role)).toBe(true)
      expect(areaById('admin').allows(role)).toBe(false)
    }
  })

  it('lets an admin into both, which is the policy this app has always had', () => {
    expect(areaById('staff').allows('Admin')).toBe(true)
    expect(areaById('admin').allows('Admin')).toBe(true)
  })

  it('normalises legacy role spellings before deciding', () => {
    expect(normalizeRole('staff')).toBe('CampusStaff')
    expect(normalizeRole('tour_operator')).toBe('TourOperator')
    expect(isStaffRole('operator')).toBe(true)
    expect(isAdminRole('admin')).toBe(true)
    expect(isAdminRole('operator')).toBe(false)
    // Anything unrecognised is a visitor, never an accidental staff member.
    expect(normalizeRole('superuser')).toBe('Visitor')
    expect(isStaffRole('superuser')).toBe(false)
  })

  it('lands each role in its own area after sign-in', () => {
    expect(homePathForRole('Admin')).toBe('/admin')
    expect(homePathForRole('CampusStaff')).toBe('/staff')
    expect(homePathForRole('TourOperator')).toBe('/staff')
    expect(homePathForRole('Visitor')).toBe('/')
    expect(homePathForRole(undefined)).toBe('/')
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
