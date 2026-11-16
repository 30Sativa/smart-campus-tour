import { describe, expect, it } from 'vitest'
import type { PoiRevision } from '../../technical/api/technical'
import { revisionChange } from './poi-revision-change'

const base: PoiRevision = {
  id: 'r1', revisionNumber: 1, mapVersionId: 'map-1', mapKey: 'm', name: 'Thư viện', purpose: 'Tham quan', description: null,
  x: 1.23456, y: 2, yaw: 0.1234561, cameraPreset: 'FRONT', navigationFingerprint: 'aa', createdAt: '2026-11-01T00:00:00Z',
  isSubmitted: true, submittedAt: null, navigationStatus: 'PASS', verificationSourceRevisionId: null,
}

describe('revisionChange', () => {
  it('reads a save that kept the navigation fingerprint as content only, naming the fields', () => {
    expect(revisionChange(base, { ...base, name: 'Thư viện mới' })).toBe('chỉ đổi nội dung (tên)')
    expect(revisionChange(base, { ...base, purpose: 'Khác', description: 'Mô tả' })).toBe('chỉ đổi nội dung (mục đích, mô tả)')
    expect(revisionChange(base, { ...base })).toBe('chỉ đổi nội dung')
  })

  it('names each navigation field at the server precision', () => {
    // Below the persisted precision (4 decimals for x/y, 6 for yaw) is not a change.
    expect(revisionChange(base, { ...base, x: 1.2351, navigationFingerprint: 'bb' })).toBe('đổi phần cần kiểm lại: vị trí')
    expect(revisionChange(base, { ...base, x: 1.234561, navigationFingerprint: 'bb' })).toBe('đổi phần cần kiểm lại')
    expect(revisionChange(base, { ...base, mapVersionId: 'map-2', yaw: 0.2, cameraPreset: 'LEFT', navigationFingerprint: 'bb' }))
      .toBe('đổi phần cần kiểm lại: bản đồ, hướng, camera')
  })

  it('falls back to comparing the fields when a fingerprint is missing', () => {
    const { navigationFingerprint: _omit, ...withoutFingerprint } = base
    void _omit
    expect(revisionChange(withoutFingerprint, { ...withoutFingerprint, name: 'Khác' })).toBe('chỉ đổi nội dung (tên)')
    expect(revisionChange(withoutFingerprint, { ...withoutFingerprint, y: 3 })).toBe('đổi phần cần kiểm lại: vị trí')
  })
})
