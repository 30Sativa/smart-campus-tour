import { vi } from 'vitest'

/** jsdom has no SVG layout; emulate its screen CTM, not the picker transform. */
export function installSvgLayout() {
  const prototype = SVGSVGElement.prototype
  const properties = ['getScreenCTM', 'setPointerCapture'] as const
  const originals = properties.map((key) => Object.getOwnPropertyDescriptor(prototype, key))
  Object.defineProperty(prototype, 'getScreenCTM', {
    configurable: true,
    value(this: SVGSVGElement) {
      const [u, v, width, height] = this.getAttribute('viewBox')!.split(' ').map(Number)
      const scale = Math.min(800 / width, 420 / height)
      return { a: scale, b: 0, c: 0, d: scale, e: 100 + (800 - width * scale) / 2 - u * scale, f: 50 + (420 - height * scale) / 2 - v * scale }
    },
  })
  Object.defineProperty(prototype, 'setPointerCapture', { configurable: true, value: () => {} })
  class TestPointerEvent extends MouseEvent {
    pointerId: number
    constructor(type: string, init: PointerEventInit = {}) { super(type, init); this.pointerId = init.pointerId ?? 1 }
  }
  vi.stubGlobal('PointerEvent', TestPointerEvent)
  return () => {
    properties.forEach((key, index) => {
      if (originals[index]) Object.defineProperty(prototype, key, originals[index]!)
      else Reflect.deleteProperty(prototype, key)
    })
  }
}

export function pointerAt(svg: SVGSVGElement, u: number, v: number) {
  const matrix = svg.getScreenCTM()!
  return { clientX: matrix.a * u + matrix.c * v + matrix.e, clientY: matrix.b * u + matrix.d * v + matrix.f, button: 0, pointerId: 1 }
}
