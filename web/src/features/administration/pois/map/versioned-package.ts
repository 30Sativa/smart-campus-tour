import { unzipSync } from 'fflate'
import { parse as parseYaml } from 'yaml'
import type { GridGeometry } from './occupancy-grid'

const MAX_PACKAGE_BYTES = 32 * 1024 * 1024
const MAX_RASTER_CELLS = 32_000_000

export type VersionedMapRaster = GridGeometry & {
  frameId: string
  imageSha256: string
  pixels: Uint8ClampedArray
  sourceYaml: string
}

type RosMapMetadata = {
  image: string
  mode: 'trinary'
  resolution: number
  origin: [number, number, number]
  negate: 0 | 1
  occupied_thresh: number
  free_thresh: number
}

function fail(message: string): never {
  throw new Error(message)
}

function parseMetadata(source: string): RosMapMetadata {
  let value: unknown
  try { value = parseYaml(source) } catch { return fail('YAML map không hợp lệ.') }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail('YAML map phải là một object metadata.')
  const metadata = value as Record<string, unknown>
  const expected = ['image', 'mode', 'resolution', 'origin', 'negate', 'occupied_thresh', 'free_thresh']
  if (Object.keys(metadata).some(key => !expected.includes(key)) || expected.some(key => !(key in metadata)))
    return fail('YAML phải có đúng bảy trường ROS map-server được hỗ trợ.')
  const originValue = metadata.origin
  const origin: unknown[] = Array.isArray(originValue) ? originValue :
    typeof originValue === 'string' ? originValue.trim().replace(/^\[|\]$/g, '').split(',').map(part => Number(part.trim())) : []
  if (origin.length !== 3 || origin.some(part => typeof part !== 'number' || !Number.isFinite(part)))
    return fail('Origin phải có ba số [x, y, yaw].')
  const image = metadata.image
  if (typeof image !== 'string' || !/^[^/\\.][^/\\]*\.pgm$/i.test(image))
    return fail('Tên ảnh trong YAML phải là PGM ở thư mục gốc ZIP.')
  if (metadata.mode !== 'trinary' || ![0, 1].includes(metadata.negate as number))
    return fail('Chỉ hỗ trợ mode trinary và negate 0 hoặc 1.')
  const numeric = ['resolution', 'occupied_thresh', 'free_thresh'] as const
  for (const key of numeric) if (typeof metadata[key] !== 'number' || !Number.isFinite(metadata[key]))
    return fail(`Trường ${key} phải là số hữu hạn.`)
  const resolution = metadata.resolution as number
  const occupied = metadata.occupied_thresh as number
  const free = metadata.free_thresh as number
  if (resolution <= 0 || resolution > 100 || occupied < 0 || occupied > 1 || free < 0 || free > 1 || free >= occupied)
    return fail('Resolution hoặc ngưỡng occupancy nằm ngoài phạm vi hỗ trợ.')
  if (origin[2] !== 0) return fail('Map origin yaw khác 0 chưa được hỗ trợ.')
  return { image, mode: 'trinary', resolution, origin: origin as [number, number, number], negate: metadata.negate as 0 | 1,
    occupied_thresh: occupied, free_thresh: free }
}

class PgmReader {
  private offset = 0
  private readonly bytes: Uint8Array
  constructor(bytes: Uint8Array) { this.bytes = bytes }
  token(): string {
    while (this.offset < this.bytes.length) {
      const byte = this.bytes[this.offset]
      if (byte === 35) { while (this.offset < this.bytes.length && this.bytes[this.offset] !== 10 && this.bytes[this.offset] !== 13) this.offset++; continue }
      if (byte === 9 || byte === 10 || byte === 11 || byte === 12 || byte === 13 || byte === 32) { this.offset++; continue }
      break
    }
    const start = this.offset
    while (this.offset < this.bytes.length) {
      const byte = this.bytes[this.offset]
      if (byte === 35 || byte === 9 || byte === 10 || byte === 11 || byte === 12 || byte === 13 || byte === 32) break
      this.offset++
    }
    if (start === this.offset) return fail('PGM header thiếu trường bắt buộc.')
    return new TextDecoder('ascii').decode(this.bytes.subarray(start, this.offset))
  }
  binarySamples(count: number): Uint8Array {
    const delimiter = this.bytes[this.offset]
    if (![9, 10, 11, 12, 13, 32].includes(delimiter)) return fail('PGM P5 thiếu khoảng trắng sau maxval.')
    this.offset++
    if (delimiter === 13 && this.bytes[this.offset] === 10) this.offset++
    if (this.bytes.length - this.offset !== count) return fail('Số byte raster PGM không khớp kích thước khai báo.')
    return this.bytes.subarray(this.offset)
  }
  hasMoreToken(): boolean {
    try { this.token(); return true } catch { return false }
  }
}

function parsePgm(bytes: Uint8Array, metadata: RosMapMetadata): Omit<VersionedMapRaster, 'frameId' | 'imageSha256' | 'sourceYaml'> {
  const reader = new PgmReader(bytes)
  const magic = reader.token()
  if (magic !== 'P2' && magic !== 'P5') return fail('Chỉ hỗ trợ PGM 8-bit P2 hoặc P5.')
  const width = Number(reader.token())
  const height = Number(reader.token())
  const maxValue = Number(reader.token())
  const count = width * height
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0 ||
      !Number.isInteger(maxValue) || maxValue <= 0 || maxValue > 255 || !Number.isSafeInteger(count) || count > MAX_RASTER_CELLS)
    return fail('Kích thước PGM hoặc maxval không hợp lệ.')
  const samples = magic === 'P5' ? reader.binarySamples(count) : Uint8Array.from({ length: count }, () => {
    const sample = Number(reader.token())
    if (!Number.isInteger(sample) || sample < 0 || sample > maxValue) return fail('Mẫu pixel PGM nằm ngoài maxval.')
    return sample
  })
  if (magic === 'P2' && reader.hasMoreToken()) return fail('PGM P2 có nhiều pixel hơn kích thước khai báo.')
  const pixels = new Uint8ClampedArray(count * 4)
  for (let index = 0; index < count; index++) {
    const sample = samples[index] / maxValue
    const occupancy = metadata.negate === 1 ? sample : 1 - sample
    const grayscale = occupancy > metadata.occupied_thresh ? 0 : occupancy < metadata.free_thresh ? 255 : 128
    const offset = index * 4
    pixels[offset] = grayscale
    pixels[offset + 1] = grayscale
    pixels[offset + 2] = grayscale
    pixels[offset + 3] = 255
  }
  return { width, height, resolution: metadata.resolution, origin: metadata.origin, pixels }
}

export async function parseVersionedMapPackage(input: ArrayBuffer, expectedImageFileName: string): Promise<VersionedMapRaster> {
  if (input.byteLength <= 0 || input.byteLength > MAX_PACKAGE_BYTES) return fail('Gói map vượt kích thước được hỗ trợ.')
  let entries: Record<string, Uint8Array>
  try { entries = unzipSync(new Uint8Array(input)) } catch { return fail('Không thể đọc ZIP map.') }
  const names = Object.keys(entries)
  if (names.length !== 2 || names.some(name => name.includes('/') || name.includes('\\')))
    return fail('ZIP phải chứa đúng một YAML và một PGM ở thư mục gốc.')
  const yamlNames = names.filter(name => /\.ya?ml$/i.test(name))
  const pgmNames = names.filter(name => /\.pgm$/i.test(name))
  if (yamlNames.length !== 1 || pgmNames.length !== 1 || pgmNames[0] !== expectedImageFileName)
    return fail('ZIP không khớp YAML và ảnh PGM đã được máy chủ xác nhận.')
  const sourceYaml = new TextDecoder('utf-8', { fatal: true }).decode(entries[yamlNames[0]])
  const metadata = parseMetadata(sourceYaml)
  if (metadata.image !== pgmNames[0]) return fail('Tên ảnh YAML không khớp file PGM trong ZIP.')
  const raster = parsePgm(entries[pgmNames[0]], metadata)
  const digest = await crypto.subtle.digest('SHA-256', entries[pgmNames[0]].slice().buffer as ArrayBuffer)
  const imageSha256 = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
  return { ...raster, frameId: 'map', imageSha256, sourceYaml }
}

export function rasterPngBlob(raster: VersionedMapRaster): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas')
    canvas.width = raster.width
    canvas.height = raster.height
    const context = canvas.getContext('2d')
    if (!context) { reject(new Error('Không thể dựng ảnh map trong trình duyệt.')); return }
    context.putImageData(new ImageData(new Uint8ClampedArray(raster.pixels), raster.width, raster.height), 0, 0)
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Không thể tạo ảnh xem trước map.')), 'image/png')
  })
}
