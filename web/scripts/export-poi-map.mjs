import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'
import { parse } from 'yaml'

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = resolve(webRoot, '..')
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

export function readPgm(bytes) {
  let offset = 0
  const whitespace = (value) => [9, 10, 11, 12, 13, 32].includes(value)
  const token = () => {
    while (offset < bytes.length) {
      if (whitespace(bytes[offset])) offset++
      else if (bytes[offset] === 35) {
        while (offset < bytes.length && bytes[offset] !== 10) offset++
      } else break
    }
    const start = offset
    while (offset < bytes.length && !whitespace(bytes[offset])) offset++
    return bytes.toString('ascii', start, offset)
  }
  const magic = token()
  const width = Number(token())
  const height = Number(token())
  const maxValue = Number(token())
  if (magic !== 'P5' || !Number.isSafeInteger(width) || !Number.isSafeInteger(height) ||
      width <= 0 || height <= 0 || maxValue !== 255) {
    throw new Error('The exporter supports binary P5, 8-bit PGM maps only.')
  }
  // Consume exactly the header delimiter, not whitespace-valued raster bytes.
  if (!whitespace(bytes[offset])) throw new Error('Missing PGM raster delimiter.')
  if (bytes[offset] === 13 && bytes[offset + 1] === 10) offset += 2
  else offset++
  const pixels = bytes.subarray(offset)
  if (pixels.length !== width * height) throw new Error('PGM raster dimensions do not match its header.')
  return { width, height, pixels }
}

export function validateMetadata(metadata) {
  const finite = (value) => typeof value === 'number' && Number.isFinite(value)
  if (!metadata || typeof metadata.image !== 'string' || !metadata.image.trim() ||
      metadata.mode !== 'trinary' || !finite(metadata.resolution) || metadata.resolution <= 0 ||
      !Array.isArray(metadata.origin) || metadata.origin.length !== 3 || !metadata.origin.every(finite) ||
      ![0, 1, false, true].includes(metadata.negate) ||
      !finite(metadata.free_thresh) || !finite(metadata.occupied_thresh) ||
      metadata.free_thresh < 0 || metadata.occupied_thresh > 1 ||
      metadata.free_thresh >= metadata.occupied_thresh) {
    throw new Error('Invalid or unsupported ROS trinary map metadata.')
  }
  if (metadata.origin[2] !== 0) {
    throw new Error('Nonzero origin yaw is unsupported: Nav2 Humble StaticLayer and AMCL ignore map origin orientation.')
  }
  return metadata
}

export function classifyPixel(gray, metadata) {
  const shade = gray / 255
  const occupancy = metadata.negate ? shade : 1 - shade
  // Strict comparisons match nav2_map_server's Humble trinary loader.
  return occupancy > metadata.occupied_thresh ? 0 : occupancy < metadata.free_thresh ? 255 : 128
}

export function buildMapPackage({ sourceYaml, mapKey, frameId = 'map', root = repoRoot }) {
  if (!/^[a-z0-9][a-z0-9-]{0,99}$/.test(mapKey) || frameId !== 'map') {
    throw new Error('Use a versioned lowercase MapKey and the supported map frame.')
  }
  const yamlPath = resolve(root, sourceYaml)
  const yamlBytes = readFileSync(yamlPath)
  const metadata = validateMetadata(parse(yamlBytes.toString('utf8')))
  const pgmPath = resolve(dirname(yamlPath), metadata.image)
  const sourcePath = (path) => {
    const pathFromRoot = relative(root, path)
    if (pathFromRoot.startsWith('..') || resolve(root, pathFromRoot) !== path) {
      throw new Error('Map sources must remain inside the repository.')
    }
    return pathFromRoot.split(sep).join('/')
  }
  const pgmBytes = readFileSync(pgmPath)
  const { width, height, pixels } = readPgm(pgmBytes)
  const png = new PNG({ width, height })
  const cellCounts = { free: 0, occupied: 0, unknown: 0 }
  for (let index = 0; index < pixels.length; index++) {
    const value = classifyPixel(pixels[index], metadata)
    cellCounts[value === 0 ? 'occupied' : value === 255 ? 'free' : 'unknown']++
    const rgba = index * 4
    png.data[rgba] = png.data[rgba + 1] = png.data[rgba + 2] = value
    png.data[rgba + 3] = 255
  }
  const imageBytes = PNG.sync.write(png, { colorType: 0, inputColorType: 6 })
  const geometry = {
    width, height, resolution: metadata.resolution, origin: metadata.origin,
    mode: metadata.mode, negate: Number(metadata.negate),
    occupiedThreshold: metadata.occupied_thresh, freeThreshold: metadata.free_thresh,
  }
  const source = {
    yaml: sourcePath(yamlPath), pgm: sourcePath(pgmPath),
    yamlSha256: sha256(yamlBytes), pgmSha256: sha256(pgmBytes),
  }
  const fingerprint = sha256(JSON.stringify({ ...geometry, pgmSha256: source.pgmSha256, frameId }))
  const imageSha256 = sha256(imageBytes)
  const manifest = {
    schemaVersion: 1, mapKey, frameId, ...geometry, fingerprint,
    imageUrl: `/maps/${mapKey}/occupancy-${imageSha256.slice(0, 16)}.png`,
    imageSha256, source, cellCounts,
  }
  return { manifest, imageBytes }
}

export function exportMap({ sourceYaml = 'robot/robot_maps/map2.yaml', mapKey = 'map2-v1', check = false, root = repoRoot, outputRoot = webRoot } = {}) {
  const { manifest, imageBytes } = buildMapPackage({ sourceYaml, mapKey, root })
  const manifestPath = resolve(outputRoot, `src/features/administration/pois/map/${mapKey}.generated.json`)
  const imagePath = resolve(outputRoot, `public${manifest.imageUrl}`)
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`)
  if (check) {
    if (!existsSync(manifestPath) || !existsSync(imagePath) ||
        !readFileSync(manifestPath).equals(manifestBytes) || !readFileSync(imagePath).equals(imageBytes)) {
      throw new Error('POI map package is missing or stale. Export it; changed geometry requires a new MapKey.')
    }
    return manifest
  }
  if (existsSync(manifestPath)) {
    const existing = JSON.parse(readFileSync(manifestPath, 'utf8'))
    if (existing.fingerprint !== manifest.fingerprint) {
      throw new Error('Refusing to replace geometry under an existing MapKey. Export a new revision with --map-key.')
    }
  }
  mkdirSync(dirname(manifestPath), { recursive: true })
  mkdirSync(dirname(imagePath), { recursive: true })
  writeFileSync(imagePath, imageBytes)
  writeFileSync(manifestPath, manifestBytes)
  return manifest
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  const keyIndex = args.indexOf('--map-key')
  if (args.some((arg, index) => arg !== '--check' && arg !== '--map-key' && !(keyIndex >= 0 && index === keyIndex + 1)) ||
      (keyIndex >= 0 && (!args[keyIndex + 1] || args[keyIndex + 1].startsWith('--')))) {
    throw new Error('Usage: node scripts/export-poi-map.mjs [--check] [--map-key map2-v2]')
  }
  const manifest = exportMap({ check: args.includes('--check'), mapKey: keyIndex >= 0 ? args[keyIndex + 1] : 'map2-v1' })
  console.log(`${args.includes('--check') ? 'Verified' : 'Exported'} ${manifest.mapKey}: ${manifest.width}x${manifest.height}, ${manifest.cellCounts.unknown} unknown cells`)
}
