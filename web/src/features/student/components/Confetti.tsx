import { useEffect, useRef } from 'react'

const COLORS = ['#d6f18d', '#a6d75e', '#f4b860', '#ff8b7b', '#f2efe6']

/**
 * One burst of confetti when a finished Tour's end screen opens. Purely
 * decorative: a fixed, click-through canvas that clears itself after about
 * three seconds, and nothing at all for reduced motion.
 */
export function Confetti() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    canvas.width = window.innerWidth
    canvas.height = window.innerHeight
    const bits = Array.from({ length: 150 }, () => ({
      x: canvas.width / 2,
      y: canvas.height * 0.32,
      vx: (Math.random() - 0.5) * 14,
      vy: -Math.random() * 14 - 4,
      size: Math.random() * 6 + 3,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      angle: Math.random() * 6,
      spin: (Math.random() - 0.5) * 0.3,
    }))
    let frame = 0
    let id = 0
    const draw = () => {
      context.clearRect(0, 0, canvas.width, canvas.height)
      for (const bit of bits) {
        bit.vy += 0.35
        bit.vx *= 0.99
        bit.x += bit.vx
        bit.y += bit.vy
        bit.angle += bit.spin
        context.save()
        context.translate(bit.x, bit.y)
        context.rotate(bit.angle)
        context.fillStyle = bit.color
        context.fillRect(-bit.size / 2, -bit.size / 4, bit.size, bit.size / 2)
        context.restore()
      }
      frame += 1
      if (frame < 190) id = requestAnimationFrame(draw)
      else context.clearRect(0, 0, canvas.width, canvas.height)
    }
    id = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(id)
  }, [])

  return <canvas ref={ref} className="st-x-confetti" aria-hidden="true" />
}
