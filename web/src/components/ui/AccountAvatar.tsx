import { useState } from 'react'
import { initialsOf } from './console-crumbs'
import { avatarSrc } from './avatar-src'

/** The account's picture, or its initials when it has none or the picture cannot be loaded. */
export function AccountAvatar({ name, url, size, className = '' }: { name: string; url?: string | null; size: number; className?: string }) {
  const [failed, setFailed] = useState<string | null>(null)
  if (url && failed !== url) {
    return <img src={avatarSrc(url, size)} alt="" width={size} height={size} loading="lazy" decoding="async"
      onError={() => setFailed(url)} className={`shrink-0 object-cover ${className}`} style={{ width: size, height: size }} />
  }
  return <span aria-hidden="true" className={`grid shrink-0 place-items-center bg-[#edf3fb] font-extrabold text-[#4a6fa5] ${className}`}
    style={{ width: size, height: size, fontSize: Math.max(11, Math.round(size * 0.36)) }}>{initialsOf(name)}</span>
}
