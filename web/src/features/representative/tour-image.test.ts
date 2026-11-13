import { describe, expect, it } from 'vitest'
import { tourImage, tourImages } from './tour-image'

const tour = (id: string, name: string, stops: string[] = []) => ({ id, name, routeName: 'Tuyến A', stops: stops.map((stopName, index) => ({ order: index + 1, name: stopName, description: null })) })

describe('Tour sample images', () => {
  it('matches the library, lab and gate photos from the name or a stop', () => {
    expect(tourImage(tour('a', 'Tour thư viện')).src).toBe('/images/tours/library.webp')
    expect(tourImage(tour('b', 'Khám phá phòng Lab')).src).toBe('/images/tours/lab.webp')
    expect(tourImage(tour('c', 'Buổi sáng', ['Cổng chính'])).src).toBe('/images/tours/gate.webp')
  })

  it('keeps one campus photo per Tour id', () => {
    expect(tourImage(tour('same-id', 'Dạo khuôn viên'))).toEqual(tourImage(tour('same-id', 'Tên khác')))
  })

  it('never shows the same campus photo on two neighbouring Tours', () => {
    const list = Array.from({ length: 40 }, (_, index) => tour(`tour-${index}`, 'Dạo khuôn viên'))
    const images = tourImages(list)
    list.slice(1).forEach((item, index) => expect(images.get(item.id)!.src).not.toBe(images.get(list[index].id)!.src))
  })
})
