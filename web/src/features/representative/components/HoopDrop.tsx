import { useCallback, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { FileSpreadsheet, Volume2, VolumeX } from 'lucide-react'
import { repButton } from '../rep-classes'

const G = 2200 // px/s², the pull on the file in flight
const SOUND_KEY = 'rep-hoop-sound'

const canAnimate = () =>
  typeof window !== 'undefined' &&
  typeof window.requestAnimationFrame === 'function' &&
  typeof Element !== 'undefined' &&
  typeof Element.prototype.animate === 'function' &&
  !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

function readSound() {
  try { return window.localStorage.getItem(SOUND_KEY) === '1' } catch { return false }
}

/**
 * The roster drop zone as a hoop: drag a file over it (an aim line follows
 * the pointer) and let go, or pick up the file icon, pull back and release,
 * and the file flies into the basket. Only once it is "in" does the uploader
 * read it (`onFile`), so the existing check / preview / confirm steps are
 * unchanged. Every shot scores. Without motion (reduced motion, tests) the
 * file goes straight to `onFile`.
 */
export function HoopDrop({ onFile, inputRef, accept, inputLabel, validating, hasList }: {
  onFile: (file: File) => void
  inputRef: RefObject<HTMLInputElement | null>
  accept: string
  inputLabel: string
  /** Name of the file being checked, while it is. */
  validating: string | null
  /** A list is already confirmed: the pick button turns secondary. */
  hasList: boolean
}) {
  const courtRef = useRef<HTMLDivElement>(null)
  const hoopRef = useRef<HTMLDivElement>(null)
  const ballRef = useRef<HTMLDivElement>(null)
  const netRef = useRef<SVGSVGElement>(null)
  const pos = useRef({ x: 0, y: 0 })
  const home = useRef({ x: 0, y: 0 })
  const dots = useRef<HTMLElement[]>([])
  const drag = useRef<{ dx: number; dy: number } | null>(null)
  const aimFrom = useRef<{ x: number; y: number } | null>(null)
  const audio = useRef<AudioContext | null>(null)
  const [over, setOver] = useState(false)
  const [busy, setBusy] = useState(false)
  const [holding, setHolding] = useState(false)
  const [made, setMade] = useState(0)
  const [cheer, setCheer] = useState(0)
  const [sound, setSound] = useState(readSound)

  const place = useCallback((x: number, y: number, rot = 0, scale = 1) => {
    pos.current = { x, y }
    if (ballRef.current) ballRef.current.style.transform = `translate(${x - 23}px,${y - 28}px) rotate(${rot}deg) scale(${scale})`
  }, [])

  const rim = useCallback(() => {
    const court = courtRef.current?.getBoundingClientRect()
    const hoop = hoopRef.current?.getBoundingClientRect()
    if (!court || !hoop) return { x: 0, y: 0, s: 1 }
    const s = hoop.width / 150
    return { x: hoop.left - court.left + 75 * s, y: hoop.top - court.top + 88 * s, s }
  }, [])

  useEffect(() => {
    const court = courtRef.current
    if (!court) return
    const settle = () => {
      const box = court.getBoundingClientRect()
      home.current = { x: Math.max(64, box.width * 0.15), y: box.height - 86 }
      if (!busy && !drag.current) place(home.current.x, home.current.y)
    }
    settle()
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(settle) : null
    observer?.observe(court)
    return () => observer?.disconnect()
  }, [busy, place])

  const flight = (x0: number, y0: number) => {
    const target = rim()
    const T = Math.min(1.15, Math.max(0.6, Math.hypot(target.x - x0, target.y - y0) / 520))
    const ty = target.y - 10
    return { T, vx: (target.x - x0) / T, vy: (ty - y0 - 0.5 * G * T * T) / T, tx: target.x, ty, s: target.s }
  }

  const clearAim = () => { dots.current.forEach((dot) => dot.remove()); dots.current = []; aimFrom.current = null }
  const showAim = (x0: number, y0: number) => {
    const court = courtRef.current
    if (!court || !canAnimate()) return
    clearAim()
    aimFrom.current = { x: x0, y: y0 }
    const a = flight(x0, y0)
    for (let i = 1; i <= 11; i += 1) {
      const t = (a.T * i) / 12
      const dot = document.createElement('i')
      dot.className = 'rep-hoop-dot'
      dot.style.left = `${x0 + a.vx * t}px`
      dot.style.top = `${y0 + a.vy * t + 0.5 * G * t * t}px`
      dot.style.opacity = String(0.6 - i * 0.035)
      court.appendChild(dot)
      dots.current.push(dot)
    }
  }

  const play = (kind: 'throw' | 'swish' | 'score') => {
    if (!sound) return
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctx) return
      audio.current ??= new Ctx()
      const ctx = audio.current
      if (kind === 'swish') {
        const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.35, ctx.sampleRate)
        const data = buffer.getChannelData(0)
        for (let i = 0; i < data.length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 2
        const src = ctx.createBufferSource(); const filter = ctx.createBiquadFilter(); const gain = ctx.createGain()
        filter.type = 'bandpass'; filter.frequency.value = 2400; gain.gain.value = 0.35
        src.buffer = buffer; src.connect(filter).connect(gain).connect(ctx.destination); src.start()
        return
      }
      const [f1, f2, dur, vol] = kind === 'throw' ? [220, 120, 0.12, 0.2] : [660, 990, 0.2, 0.12]
      const osc = ctx.createOscillator(); const gain = ctx.createGain()
      osc.type = kind === 'throw' ? 'triangle' : 'sine'
      osc.frequency.setValueAtTime(f1, ctx.currentTime); osc.frequency.exponentialRampToValueAtTime(f2, ctx.currentTime + dur)
      gain.gain.setValueAtTime(vol, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur)
      osc.connect(gain).connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + dur)
    } catch { /* sound is a nicety */ }
  }

  const confetti = (x: number, y: number) => {
    const court = courtRef.current
    if (!court) return
    const colors = ['#d6f18d', '#a6d75e', '#e8642c', '#276451', '#f3c66b']
    for (let i = 0; i < 18; i += 1) {
      const piece = document.createElement('i')
      piece.className = 'rep-hoop-confetti'
      piece.style.background = colors[i % colors.length]
      piece.style.left = `${x}px`; piece.style.top = `${y}px`
      court.appendChild(piece)
      const angle = Math.PI * (1 + Math.random()); const speed = 140 + Math.random() * 160
      piece.animate(
        [{ transform: 'translate(0,0) rotate(0)', opacity: 1 }, { transform: `translate(${Math.cos(angle) * speed}px,${Math.sin(angle) * speed + 120}px) rotate(${Math.random() * 720}deg)`, opacity: 0 }],
        { duration: 900 + Math.random() * 400, easing: 'cubic-bezier(.2,.7,.4,1)' },
      ).onfinish = () => piece.remove()
    }
  }

  const backHome = () => {
    const ball = ballRef.current
    if (!ball) return
    ball.style.transition = 'none'; ball.style.opacity = '0'; ball.style.zIndex = ''
    place(home.current.x, home.current.y + 30, 0, 0.6)
    // A timer, not a frame: the file must come back even if the tab paused drawing.
    window.setTimeout(() => {
      ball.style.transition = 'transform .5s var(--rep-ease), opacity .4s'
      ball.style.opacity = '1'
      place(home.current.x, home.current.y)
      window.setTimeout(() => { ball.style.transition = ''; setBusy(false) }, 520)
    }, 30)
  }

  /** The shot: from (x0, y0) along an arc, into the rim, down through the net. */
  const shoot = (file: File, x0 = pos.current.x, y0 = pos.current.y) => {
    clearAim()
    if (!canAnimate() || !ballRef.current || document.hidden) { onFile(file); return }
    setBusy(true)
    play('throw')
    const ball = ballRef.current
    const a = flight(x0, y0)
    const spin = (a.vx > 0 ? 1 : -1) * 540
    const start = performance.now()
    let lastTrail = 0
    let done = false
    // The file lands exactly once: when it drops through the net, or - if the
    // tab stopped drawing frames mid-flight - after the time the shot takes.
    const land = () => {
      if (done) return
      done = true
      setMade((n) => n + 1); setCheer((n) => n + 1)
      play('score')
      confetti(a.tx, a.ty)
      onFile(file)
      window.setTimeout(backHome, 600)
    }
    window.setTimeout(land, (a.T + 0.42) * 1000 + 1200)
    const step = (now: number) => {
      const t = Math.min(a.T, (now - start) / 1000)
      const x = x0 + a.vx * t; const y = y0 + a.vy * t + 0.5 * G * t * t
      place(x, y, (spin * t) / a.T, 1 - 0.28 * (t / a.T))
      if (now - lastTrail > 45 && courtRef.current) {
        lastTrail = now
        const trail = document.createElement('i'); trail.className = 'rep-hoop-trail'
        trail.style.left = `${x}px`; trail.style.top = `${y}px`
        courtRef.current.appendChild(trail); window.setTimeout(() => trail.remove(), 1000)
      }
      if (t < a.T) { requestAnimationFrame(step); return }
      // Through the hoop: behind the front of the rim, the net stretches.
      ball.style.zIndex = '1'
      netRef.current?.animate([{ transform: 'none' }, { transform: 'scaleY(1.22) scaleX(.9)', offset: 0.3 }, { transform: 'scaleY(.95)', offset: 0.65 }, { transform: 'none' }], { duration: 600, easing: 'cubic-bezier(.22,1,.36,1)' })
      play('swish')
      const dropStart = performance.now()
      const drop = (now2: number) => {
        const k = Math.min(1, (now2 - dropStart) / 420)
        place(a.tx, a.ty + k * 78 * a.s, spin, 0.72 - 0.12 * k)
        ball.style.opacity = String(1 - k * k)
        if (k < 1) { requestAnimationFrame(drop); return }
        land()
      }
      requestAnimationFrame(drop)
    }
    requestAnimationFrame(step)
  }

  const fromCourt = (clientX: number, clientY: number) => {
    const box = courtRef.current!.getBoundingClientRect()
    return { x: Math.min(box.width - 30, Math.max(30, clientX - box.left)), y: Math.min(box.height - 34, Math.max(170, clientY - box.top)) }
  }
  const open = () => inputRef.current?.click()

  return (
    <div
      ref={courtRef}
      className={`rep-hoop${over ? ' is-over' : ''}`}
      onDragOver={(event) => {
        event.preventDefault()
        if (!over) setOver(true)
        if (busy || !courtRef.current) return
        const p = fromCourt(event.clientX, event.clientY)
        place(p.x, p.y)
        if (!aimFrom.current || Math.hypot(aimFrom.current.x - p.x, aimFrom.current.y - p.y) > 6) showAim(p.x, p.y)
      }}
      onDragLeave={(event) => {
        if (courtRef.current?.contains(event.relatedTarget as Node | null)) return
        setOver(false); clearAim()
        if (!busy) place(home.current.x, home.current.y)
      }}
      onDrop={(event) => {
        event.preventDefault(); setOver(false)
        const file = event.dataTransfer.files[0]
        if (!file) { clearAim(); return }
        if (busy) { onFile(file); return }
        shoot(file)
      }}
    >
      <input
        ref={inputRef}
        type="file"
        className="sr-only"
        tabIndex={-1}
        accept={accept}
        aria-label={inputLabel}
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (!file) return
          if (busy) { onFile(file); return }
          shoot(file)
        }}
      />

      <div className="rep-hoop-tools">
        <button
          type="button"
          className="rep-hoop-sound"
          aria-pressed={sound}
          aria-label={sound ? 'Tắt âm thanh khi ném' : 'Bật âm thanh khi ném'}
          title={sound ? 'Tắt âm thanh' : 'Bật âm thanh'}
          onClick={() => setSound((value) => { try { window.localStorage.setItem(SOUND_KEY, value ? '0' : '1') } catch { /* private mode */ } return !value })}
        >
          {sound ? <Volume2 size={15} aria-hidden="true" /> : <VolumeX size={15} aria-hidden="true" />}
        </button>
        <span key={cheer} className={`rep-hoop-count${cheer ? ' is-bump' : ''}`} aria-live="polite">Đã ném <b className="num">{made}</b></span>
      </div>

      <div className="rep-hoop-head">
        {validating ? (
          <p className="rep-hoop-checking" role="status"><span className="rep-hoop-spin" aria-hidden="true" />Đang kiểm tra <span className="break-all">{validating}</span>...</p>
        ) : (
          <>
            <p className="rep-drop-title">Kéo thả file Excel vào đây</p>
            <p className="rep-drop-or">hoặc</p>
            <button type="button" onClick={open} className={repButton(hasList ? 'secondary' : 'dark')}>
              <FileSpreadsheet size={16} aria-hidden="true" />Chọn file Excel
            </button>
          </>
        )}
      </div>

      <div ref={hoopRef} className="rep-hoop-hoop" aria-hidden="true">
        <div className="rep-hoop-board" />
        <svg className="rep-hoop-rim rep-hoop-rim--back" viewBox="0 0 106 22"><path d="M3 11a50 9 0 0 1 100 0" /></svg>
        <svg ref={netRef} className="rep-hoop-net" viewBox="0 0 106 78"><g><path d="M6 6 L22 72 M22 8 L34 74 M38 9 L45 75 M53 9 L53 76 M68 9 L61 75 M84 8 L72 74 M100 6 L84 72" /><path d="M6 6 Q53 22 100 6 M12 26 Q53 40 94 26 M17 46 Q53 58 89 46 M22 66 Q53 76 84 66" /></g></svg>
        <svg className="rep-hoop-rim rep-hoop-rim--front" viewBox="0 0 106 22"><path d="M3 11a50 9 0 0 0 100 0" /></svg>
      </div>
      {cheer > 0 && <span key={`b${cheer}`} className="rep-hoop-banner" aria-hidden="true">Vào rổ! 🏀</span>}

      <div
        ref={ballRef}
        className={`rep-hoop-ball${busy ? '' : ' is-ready'}`}
        role="button"
        tabIndex={busy ? -1 : 0}
        aria-label="Cầm file: kéo để ngắm rồi thả tay để chọn file Excel và ném vào rổ"
        onPointerDown={(event) => {
          if (busy || !courtRef.current) return
          event.currentTarget.setPointerCapture?.(event.pointerId)
          const box = courtRef.current.getBoundingClientRect()
          drag.current = { dx: event.clientX - box.left - pos.current.x, dy: event.clientY - box.top - pos.current.y }
          setHolding(true)
        }}
        onPointerMove={(event) => {
          if (!drag.current || !courtRef.current) return
          const p = fromCourt(event.clientX - drag.current.dx, event.clientY - drag.current.dy)
          place(p.x, p.y, (p.x - home.current.x) * 0.05)
          showAim(p.x, p.y)
        }}
        onPointerUp={() => {
          if (!drag.current) return
          drag.current = null
          setHolding(false)
          // Releasing is the throw: choose the file now, it flies from here once chosen.
          open()
        }}
        onPointerCancel={() => { drag.current = null; setHolding(false); clearAim(); place(home.current.x, home.current.y) }}
        onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open() } }}
      >
        <span className="rep-hoop-hand" aria-hidden="true">✋</span>
        <svg viewBox="0 0 46 56" aria-hidden="true">
          <path d="M4 4h26l12 12v34a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z" fill="#fff" stroke="#c9d6d0" strokeWidth="1.5" />
          <path d="M30 4v12h12" fill="#eaf2ed" stroke="#c9d6d0" strokeWidth="1.5" />
          <rect x="8" y="33" width="30" height="13" rx="3" fill="#1f7a45" />
          <text x="23" y="42.5" textAnchor="middle" fontSize="8.5" fontWeight="800" fill="#fff">XLSX</text>
          <path d="M10 14h14M10 20h22M10 26h18" stroke="#c9d6d0" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </div>

      <p className="rep-hoop-hint">{over ? 'Thả tay để ném vào rổ!' : holding ? 'Thả tay để chọn file và ném!' : 'Cầm file, kéo ngược lại để ngắm rồi thả tay để ném.'}</p>
    </div>
  )
}
