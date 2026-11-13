/**
 * Responsive WebP sources for the home page pictures in `public/images/home-3d/`.
 * Each picture ships at two widths; the browser picks one from `sizes`.
 */
type HomeImage = 'hero-smartbus' | 'journey-smartbus' | 'twin-smartbus' | 'closing-smartbus' | 'student'

const WIDTHS: Record<HomeImage, readonly [small: number, large: number]> = {
  'hero-smartbus': [800, 1600],
  'journey-smartbus': [800, 1600],
  'twin-smartbus': [800, 1600],
  'closing-smartbus': [800, 1600],
  student: [640, 1200],
}

/** Full-bleed pictures cover a box that is taller than 16:9 on portrait screens. */
export const FULL_BLEED_SIZES = '(max-aspect-ratio: 16/9) 178vh, 100vw'

export function homeImage(name: HomeImage) {
  const [small, large] = WIDTHS[name]
  const path = (width: number) => `/images/home-3d/${name}-${width}.webp`
  return {
    src: path(large),
    srcSet: `${path(small)} ${small}w, ${path(large)} ${large}w`,
    width: large,
    height: Math.round((large * 9) / 16),
  }
}
