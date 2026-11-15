import type { PoiRevision } from '../../technical/api/technical'

/**
 * What one save changed against the save before it. The navigation fields and their precision are those of the
 * server's fingerprint (PoiNavigationFingerprint): map, x and y to 4 decimals, yaw to 6, camera preset. A save that
 * keeps the fingerprint keeps the technical result, so it only changed content.
 */
export function revisionChange(previous: PoiRevision, next: PoiRevision): string {
  const navigation: string[] = []
  if (previous.mapVersionId !== next.mapVersionId) navigation.push('bản đồ')
  if (previous.x.toFixed(4) !== next.x.toFixed(4) || previous.y.toFixed(4) !== next.y.toFixed(4)) navigation.push('vị trí')
  if (previous.yaw.toFixed(6) !== next.yaw.toFixed(6)) navigation.push('hướng')
  if (previous.cameraPreset.trim().toUpperCase() !== next.cameraPreset.trim().toUpperCase()) navigation.push('camera')
  const sameFingerprint = previous.navigationFingerprint && next.navigationFingerprint
    ? previous.navigationFingerprint === next.navigationFingerprint
    : navigation.length === 0
  if (sameFingerprint) {
    const content = [
      previous.name !== next.name && 'tên',
      previous.purpose !== next.purpose && 'mục đích',
      (previous.description ?? '') !== (next.description ?? '') && 'mô tả',
    ].filter(Boolean)
    return content.length ? `chỉ đổi nội dung (${content.join(', ')})` : 'chỉ đổi nội dung'
  }
  return navigation.length ? `đổi điều hướng: ${navigation.join(', ')}` : 'đổi điều hướng'
}
