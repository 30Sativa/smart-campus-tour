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

  // Technical area words (spec technical-readiness W8, 23/11/2026): one name per job, so a removed name cannot come back.
  const TECHNICAL = ['features/technical/', 'routes/technical/', 'features/administration/audit/audit-labels.ts']
  it.each([
    ['Xác nhận chạy thử', 'the route-test page is Chạy thử tuyến'],
    ['Chạy thử trên robot', 'loading a map on a robot is Kiểm tra triển khai; Chạy thử is a whole route'],
    ['Ghi kết quả kiểm tra', 'a deployment check is Kiểm tra triển khai, a POI check is Kiểm chứng POI'],
    ['Đạt kiểm tra', 'a map reads Từng kiểm tra triển khai đạt; a robot reads Sẵn sàng'],
    ['Có robot đang chạy', 'the map figure counts ready robots: Có robot sẵn sàng'],
    ['Chờ kỹ thuật kiểm tra', 'a map reads Chưa kiểm tra triển khai'],
    ['giải phóng', 'a held robot is Chờ kiểm tra tại chỗ and its button is Trả robot'],
    ['Trả robot về sử dụng', 'the button is Trả robot'],
    ['Bản đồ & POI', 'the menu group is Chuẩn bị'],
  ])('the Technical area no longer writes "%s" (%s)', (word) => {
    const offenders = sourceFiles(root)
      .map(path => relative(root, path).replaceAll('\\', '/'))
      .filter(path => TECHNICAL.some(prefix => path.startsWith(prefix)))
      .filter(path => readFileSync(join(root, path), 'utf8').toLocaleLowerCase('vi').includes(word.toLocaleLowerCase('vi')))
    expect(offenders).toEqual([])
  })
})
