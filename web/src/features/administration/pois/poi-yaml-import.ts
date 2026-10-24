import { parseDocument } from 'yaml'
import type { OccupancyMap } from './map/catalog'
import { cellAtPose } from './map/occupancy-grid'

export const POI_YAML_MAX_BYTES = 64 * 1024

export type ImportedPoiPose = {
  x: number
  y: number
  yaw: number
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown> : null
}

function basename(path: string): string {
  return path.replaceAll('\\', '/').split('/').at(-1) ?? ''
}

/** One robotics pose file; the selected map revision remains authoritative. */
export function parsePoiYaml(text: string, map: OccupancyMap): ImportedPoiPose {
  if (text.length > POI_YAML_MAX_BYTES) throw new Error('File YAML chỉ nhận tối đa 64 KB.')
  let value: unknown
  try {
    const document = parseDocument(text, { schema: 'core', uniqueKeys: true })
    if (document.errors.length || document.warnings.length) throw new Error('Invalid YAML')
    value = document.toJS({ maxAliasCount: 0 })
  } catch {
    throw new Error('YAML không hợp lệ. Dùng một tài liệu POI, không có khóa trùng hoặc alias.')
  }
  const poi = record(value)
  const pose = record(poi?.pose)
  if (!poi || !pose) throw new Error('File phải chứa một POI với pose.x, pose.y và pose.yaw.')
  if (typeof poi.map_yaml !== 'string' || basename(poi.map_yaml.trim()) !== basename(map.sourceYaml)) {
    throw new Error('map_yaml không khớp bản đồ đang chọn. Kiểm tra lại file và bản đồ.')
  }
  if (poi.frame_id !== map.frameId) throw new Error('frame_id không khớp frame của bản đồ đang chọn.')
  if (poi.map_key !== undefined && poi.map_key !== map.mapKey) {
    throw new Error('map_key không khớp phiên bản bản đồ đang chọn.')
  }
  const { x, y, yaw } = pose
  if (typeof x !== 'number' || !Number.isFinite(x) || typeof y !== 'number' || !Number.isFinite(y)
    || typeof yaw !== 'number' || !Number.isFinite(yaw)) {
    throw new Error('pose.x, pose.y và pose.yaw phải là số hữu hạn; yaw dùng radian.')
  }
  if (Math.abs(x) > 999999.9999 || Math.abs(y) > 999999.9999) {
    throw new Error('X/Y trong file vượt giới hạn số của hệ thống.')
  }
  if (yaw < -3.141593 || yaw > 3.141593) throw new Error('Yaw trong file phải nằm trong khoảng −π đến π radian.')
  // Match API precision, then check the pose that will actually be saved.
  const imported = { x: Number(x.toFixed(4)), y: Number(y.toFixed(4)), yaw: Number(yaw.toFixed(6)) }
  if (!cellAtPose(map, imported)) throw new Error('Tọa độ trong file nằm ngoài bản đồ đang chọn.')
  return imported
}

export async function importPoiYamlFile(file: File, map: OccupancyMap): Promise<ImportedPoiPose> {
  if (!/\.ya?ml$/i.test(file.name)) throw new Error('Chọn file POI có đuôi .yaml hoặc .yml.')
  if (file.size > POI_YAML_MAX_BYTES) throw new Error('File YAML chỉ nhận tối đa 64 KB.')
  const text = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string'
      ? resolve(reader.result) : reject(new Error('Không đọc được file YAML. Hãy chọn lại file.'))
    reader.onerror = reader.onabort = () => reject(new Error('Không đọc được file YAML. Hãy chọn lại file.'))
    reader.readAsText(file)
  })
  return parsePoiYaml(text, map)
}
