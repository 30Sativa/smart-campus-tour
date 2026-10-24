/** Class recipes of the representative area, kept out of component files (fast refresh). */

export type RepButtonKind = 'primary' | 'dark' | 'secondary' | 'danger' | 'ghost' | 'media'

/** Pill buttons in the public Home's style; colours come from representative.css tokens. */
export function repButton(kind: RepButtonKind = 'secondary', size: 'sm' | 'md' | 'lg' = 'md', block = false) {
  return `rep-btn rep-btn--${kind}${size === 'md' ? '' : ` rep-btn--${size}`}${block ? ' rep-btn--block' : ''}`
}

/** Panel surface. */
export const panelBase = 'rep-panel'

/** Clickable card lift; the card classes carry their own hover. */
export const cardHover = ''

/** Images used for Tour visuals, in rotation. */
export const TOUR_IMAGES = [
  '/images/home-3d/journey-smartbus.png',
  '/images/representative-campus.png',
  '/images/home-3d/twin-smartbus.png',
  '/images/home-3d/closing-smartbus.png',
]
