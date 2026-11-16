import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

// D10: the UI writes "Hủy", never "Huỷ". The one exception is a stored backend value matched by text.
const ALLOWED = new Set(['features/representative/rep-format.ts'])
const root = join(process.cwd(), 'src')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name) ? [path] : []
  })
}

describe('UI spelling', () => {
  it('writes "Hủy", not "Huỷ"', () => {
    const offenders = sourceFiles(root)
      .map(path => relative(root, path).replaceAll('\\', '/'))
      .filter(path => !ALLOWED.has(path) && /[uU]ỷ/.test(readFileSync(join(root, path), 'utf8')))
    expect(offenders).toEqual([])
  })
})
