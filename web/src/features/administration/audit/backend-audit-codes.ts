import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Test-only scanner (never imported by the app): finds every audit action code
 * the backend writes, so the labels in `audit-labels.ts` cannot fall behind.
 *
 * It reads the C# sources (the monorepo checkout includes `backend/`) and takes
 * the UPPER_SNAKE literal, or the `const string` it names, wherever an audit row
 * gets or is matched on its action:
 * - `Action = ...`, `action = ...`, `*AuditAction = ...`;
 * - the audit helpers `RouteAudit.Append`, `TourRequestReceipt.Append`,
 *   `InvitationAudit.Create`, `RegistrationAudit.Create`,
 *   `TourCancelNoticeAudit.Create` and `Audit(`;
 * - comparisons `.Action == X` / `.Action != X`;
 * - every constant declared in a `*Audit.cs` file.
 * `ResultCode = ...`, `EventType = ...` and `code = "..."` are left out: they are
 * results, Tour events and delivery details, not audit actions.
 * Codes built at runtime (`"INVITATION_" + operation`) are invisible here, so
 * `audit-labels.ts` lists them by hand.
 */
const CODE = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$/
const CONST = /\bconst\s+string\s+(\w+)\s*=\s*"([A-Z][A-Z0-9_]*)"/
const CLASS = /\b(?:class|record)\s+(\w+)/
const ASSIGN = /\b(?:Action|action|\w*AuditAction)\s*=(?!=)/
const HELPER = /\b(?:RouteAudit\.Append|TourRequestReceipt\.Append|InvitationAudit\.Create|RegistrationAudit\.Create|TourCancelNoticeAudit\.Create|Audit)\(/
const COMPARE = /\.Action\s*[!=]=\s*("[A-Z0-9_]+"|[\w.]+)/g
const NOT_ACTION = /\b(?:ResultCode|EventType|code)\s*=\s*(?:"[^"]*"|[\w.]+)/g
const TOKEN = /"([A-Z0-9_]+)"|\b([A-Za-z_]\w*)\.([A-Za-z_]\w*)\b|\b([A-Za-z_]\w*)\b/g

function csFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return name === 'bin' || name === 'obj' ? [] : csFiles(path)
    return name.endsWith('.cs') ? [path] : []
  })
}

export const backendSourceExists = (root: string) => existsSync(root)

export function scanBackendAuditActions(root: string): Set<string> {
  const files = csFiles(root).map(path => ({ path, lines: readFileSync(path, 'utf8').split(/\r?\n/) }))
  const qualified = new Map<string, string>()
  for (const file of files) {
    let owner = ''
    for (const line of file.lines) {
      owner = CLASS.exec(line)?.[1] ?? owner
      const constant = CONST.exec(line)
      if (constant) qualified.set(`${owner}.${constant[1]}`, constant[2])
    }
  }

  const found = new Set<string>()
  for (const file of files) {
    const local = new Map<string, string>()
    for (const line of file.lines) {
      const constant = CONST.exec(line)
      if (constant) local.set(constant[1], constant[2])
    }
    const take = (text: string) => {
      for (const [, literal, owner, member, bare] of text.replace(NOT_ACTION, '').matchAll(TOKEN)) {
        const value = literal ?? (owner ? qualified.get(`${owner}.${member}`) : local.get(bare))
        if (value && CODE.test(value)) found.add(value)
      }
    }
    const auditFile = /Audit\.cs$/.test(file.path)
    file.lines.forEach((line, index) => {
      const constant = CONST.exec(line)
      if (auditFile && constant && CODE.test(constant[2])) found.add(constant[2])
      for (const match of line.matchAll(COMPARE)) take(match[1])
      if (ASSIGN.test(line) || HELPER.test(line)) take(line.replace(COMPARE, ''))
      // A helper call whose action sits on the next line.
      if (HELPER.test(line) && !/\)\s*[;,)]?\s*$/.test(line)) take(file.lines[index + 1] ?? '')
    })
  }
  return found
}
