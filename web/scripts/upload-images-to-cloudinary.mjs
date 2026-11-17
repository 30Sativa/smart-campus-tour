#!/usr/bin/env node
/**
 * Uploads the pictures of public/images/ to Cloudinary, so that a build with VITE_CLOUDINARY_CLOUD_NAME serves them
 * from there (`cloudinaryImages` in vite.config.ts). Each file gets the public ID
 * `smartcampus/images/<path without extension>`; a file Cloudinary already holds with the same content is skipped.
 *
 * Credentials come only from the shell, never from a file in the repo or a VITE_* variable:
 *   CLOUDINARY_URL=cloudinary://<api_key>:<api_secret>@<cloud_name>   (Console → Settings → API Keys)
 *
 * Usage: npm run images:upload [-- --dry-run]
 */
import { createHash } from 'node:crypto'
import { openAsBlob, readdirSync, readFileSync } from 'node:fs'
import { extname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../public/images/', import.meta.url))
const PREFIX = 'smartcampus/images/'
const MAX_BYTES = 10 * 1024 * 1024 // Free plan image limit
const dryRun = process.argv.includes('--dry-run')

function credentials() {
  const raw = process.env.CLOUDINARY_URL
  if (!raw) throw new Error('Set CLOUDINARY_URL=cloudinary://<api_key>:<api_secret>@<cloud_name> in this shell first.')
  const url = new URL(raw)
  const apiKey = decodeURIComponent(url.username)
  const apiSecret = decodeURIComponent(url.password)
  const cloudName = url.hostname
  if (url.protocol !== 'cloudinary:' || !apiKey || !apiSecret || !cloudName) throw new Error('CLOUDINARY_URL is not cloudinary://<api_key>:<api_secret>@<cloud_name>.')
  return { apiKey, apiSecret, cloudName }
}

function listFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    return entry.isDirectory() ? listFiles(path) : entry.isFile() ? [path] : []
  })
}

/** The rule vite.config.ts relies on: '/images/a/b.webp' is served as public ID 'smartcampus/images/a/b'. */
function publicIdOf(file) {
  const path = relative(ROOT, file).split(sep).join('/')
  return PREFIX + path.slice(0, path.length - extname(path).length)
}

/** Public ID → MD5 etag of every picture already uploaded under PREFIX (Admin API). */
async function uploadedEtags({ apiKey, apiSecret, cloudName }) {
  const etags = new Map()
  const auth = 'Basic ' + Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')
  let cursor = ''
  do {
    const query = new URLSearchParams({ prefix: PREFIX, max_results: '500', ...(cursor && { next_cursor: cursor }) })
    const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/resources/image/upload?${query}`, { headers: { Authorization: auth } })
    if (!response.ok) throw new Error(`Listing uploaded pictures failed: HTTP ${response.status} ${await response.text()}`)
    const page = await response.json()
    for (const resource of page.resources) etags.set(resource.public_id, resource.etag)
    cursor = page.next_cursor ?? ''
  } while (cursor)
  return etags
}

async function upload(file, publicId, { apiKey, apiSecret, cloudName }) {
  const signed = { invalidate: 'true', overwrite: 'true', public_id: publicId, timestamp: String(Math.floor(Date.now() / 1000)) }
  const toSign = Object.keys(signed).sort().map((key) => `${key}=${signed[key]}`).join('&')
  const form = new FormData()
  form.append('file', await openAsBlob(file), relative(ROOT, file))
  for (const [key, value] of Object.entries(signed)) form.append(key, value)
  form.append('api_key', apiKey)
  form.append('signature', createHash('sha1').update(toSign + apiSecret).digest('hex'))
  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, { method: 'POST', body: form })
  if (!response.ok) throw new Error(`HTTP ${response.status} ${await response.text()}`)
}

const files = listFiles(ROOT).sort()
const ids = new Map()
for (const file of files) {
  const id = publicIdOf(file)
  if (/\s/.test(id)) throw new Error(`Rename ${relative(ROOT, file)}: a file name with a space cannot be served from Cloudinary.`)
  if (ids.has(id)) throw new Error(`${relative(ROOT, ids.get(id))} and ${relative(ROOT, file)} would share the public ID ${id}; rename one.`)
  ids.set(id, file)
}

const account = credentials()
const etags = await uploadedEtags(account)
let uploaded = 0, skipped = 0, failed = 0
for (const [id, file] of ids) {
  const name = relative(ROOT, file)
  const bytes = readFileSync(file)
  if (bytes.length > MAX_BYTES) { console.error(`✗ ${name}: ${(bytes.length / 1048576).toFixed(1)} MB, over the 10 MB limit`); failed++; continue }
  if (etags.get(id) === createHash('md5').update(bytes).digest('hex')) { skipped++; continue }
  if (dryRun) { console.log(`would upload ${name} → ${id}`); uploaded++; continue }
  try {
    await upload(file, id, account)
    console.log(`✓ ${name} → ${id}`)
    uploaded++
  } catch (error) {
    console.error(`✗ ${name}: ${error.message}`)
    failed++
  }
}
console.log(`${dryRun ? 'Would upload' : 'Uploaded'} ${uploaded}, unchanged ${skipped}, failed ${failed} (cloud ${account.cloudName}).`)
if (failed) process.exitCode = 1
