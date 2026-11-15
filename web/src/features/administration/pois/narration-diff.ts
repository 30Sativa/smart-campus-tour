export type DiffPart = { kind: 'same' | 'added' | 'removed'; text: string }

/** Words and the whitespace after them, so joining the parts gives the text back. */
const tokens = (text: string) => text.match(/\S+\s*|\s+/g) ?? []

/**
 * Word-level difference between the narration in use and the draft to approve, for the approver to read what
 * changed. A longest-common-subsequence over words: narration is at most 4000 characters, so the table stays small.
 */
export function narrationDiff(before: string, after: string): DiffPart[] {
  const a = tokens(before)
  const b = tokens(after)
  const word = (token: string) => token.trimEnd()
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      lcs[i][j] = word(a[i]) === word(b[j]) ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
  const parts: DiffPart[] = []
  const push = (kind: DiffPart['kind'], text: string) => {
    const last = parts.at(-1)
    if (last?.kind === kind) last.text += text
    else parts.push({ kind, text })
  }
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (word(a[i]) === word(b[j])) { push('same', b[j]); i++; j++ }
    else if (lcs[i + 1][j] >= lcs[i][j + 1]) push('removed', a[i++])
    else push('added', b[j++])
  }
  while (i < a.length) push('removed', a[i++])
  while (j < b.length) push('added', b[j++])
  return parts
}
