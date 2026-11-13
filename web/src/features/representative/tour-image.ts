import type { RepresentativeTour } from './api/types'

export type TourImage = { src: string; alt: string }
type TourLike = Pick<RepresentativeTour, 'id' | 'name' | 'routeName' | 'stops'>

/**
 * Sample cover images for Tours (illustrative only: the Tour API carries no
 * image). A Tour whose name, Route or stops mention the library, a lab or the
 * gate gets that photo; any other Tour gets a campus photo picked from its id,
 * so it keeps the same picture. Files live in `public/images/tours/`, 1200x675 WebP.
 */
const BY_KEYWORD: Array<{ words: string[] } & TourImage> = [
  { words: ['thư viện', 'thu vien', 'library', 'học liệu'], src: '/images/tours/library.webp', alt: 'Thư viện của trường' },
  { words: ['lab', 'thí nghiệm', 'phòng máy'], src: '/images/tours/lab.webp', alt: 'Robot dẫn tour trong phòng Lab' },
  { words: ['cổng', 'cong chinh', 'gate', 'sảnh'], src: '/images/tours/gate.webp', alt: 'Cổng chính và robot dẫn tour' },
]

const CAMPUS: TourImage[] = [
  { src: '/images/tours/campus-morning.webp', alt: 'Khuôn viên trường buổi sáng' },
  { src: '/images/tours/campus-students.webp', alt: 'Sinh viên đi dạo trong khuôn viên' },
  { src: '/images/tours/campus-path.webp', alt: 'Robot dẫn tour trên lối đi khuôn viên' },
  { src: '/images/tours/campus-evening.webp', alt: 'Khuôn viên trường buổi tối' },
  { src: '/images/tours/campus-dusk.webp', alt: 'Robot dẫn tour lúc hoàng hôn' },
]

function hash(text: string) {
  let value = 0
  for (const char of text) value = (value * 31 + char.charCodeAt(0)) >>> 0
  return value
}

function keywordImage(tour: TourLike): TourImage | null {
  const text = [tour.name, tour.routeName, ...tour.stops.map((stop) => stop.name)].join(' ').toLowerCase()
  const match = BY_KEYWORD.find(({ words }) => words.some((word) => text.includes(word)))
  return match ? { src: match.src, alt: match.alt } : null
}

/** The sample image of one Tour. */
export function tourImage(tour: TourLike): TourImage {
  return keywordImage(tour) ?? CAMPUS[hash(tour.id) % CAMPUS.length]
}

/**
 * Images for a list of Tours: as `tourImage`, except that a campus photo the
 * previous Tour already shows moves on to the next one, so neighbours differ.
 */
export function tourImages(tours: TourLike[]): Map<string, TourImage> {
  const images = new Map<string, TourImage>()
  let previous: string | null = null
  for (const tour of tours) {
    let image = keywordImage(tour)
    if (!image) {
      let index = hash(tour.id) % CAMPUS.length
      if (CAMPUS[index].src === previous) index = (index + 1) % CAMPUS.length
      image = CAMPUS[index]
    }
    images.set(tour.id, image)
    previous = image.src
  }
  return images
}
