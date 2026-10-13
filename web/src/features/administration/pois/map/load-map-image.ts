import type { OccupancyMap } from './catalog'

export type MapRaster = { pixels: Uint8ClampedArray | null }

export function loadMapImage(map: OccupancyMap): Promise<MapRaster> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      if (image.naturalWidth !== map.width || image.naturalHeight !== map.height) {
        reject(new Error('Map image dimensions do not match the manifest.'))
        return
      }
      // Sampling uses the original raster, never a scaled display or screenshot.
      try {
        const canvas = document.createElement('canvas')
        canvas.width = map.width
        canvas.height = map.height
        const context = canvas.getContext('2d', { willReadFrequently: true })
        if (!context) return resolve({ pixels: null })
        context.drawImage(image, 0, 0)
        resolve({ pixels: context.getImageData(0, 0, map.width, map.height).data })
      } catch {
        resolve({ pixels: null })
      }
    }
    image.onerror = () => reject(new Error('Map image could not be loaded.'))
    image.src = map.imageUrl
  })
}
