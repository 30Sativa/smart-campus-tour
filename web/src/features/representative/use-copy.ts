import { useState } from 'react'

/** Copy to clipboard with a short "Đã sao chép" state; falls back to a hidden textarea. */
export function useCopy() {
  const [copied, setCopied] = useState<string | null>(null)
  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const area = document.createElement('textarea')
      area.value = text
      document.body.appendChild(area)
      area.select()
      document.execCommand('copy')
      area.remove()
    }
    setCopied(key)
    window.setTimeout(() => setCopied((current) => (current === key ? null : current)), 1800)
  }
  return { copied, copy }
}
