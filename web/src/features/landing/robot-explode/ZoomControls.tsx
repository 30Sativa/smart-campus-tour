import { Minus, Plus } from 'lucide-react'
import { ZOOM, zoomPercent } from './zoom'

/** The + / − buttons in a corner of a 3D stage, with the current size between them (press it to go back to 100 %). */
export default function ZoomControls({ level, onIn, onOut, onReset }: { level: number; onIn: () => void; onOut: () => void; onReset: () => void }) {
  return (
    <div className="lp3-zoom" role="group" aria-label="Phóng to, thu nhỏ">
      <button type="button" onClick={onOut} disabled={level >= ZOOM.max} aria-label="Thu nhỏ"><Minus size={15} aria-hidden="true" /></button>
      <button type="button" className="lp3-zoom__level" onClick={onReset} disabled={level === 1} aria-label={`Cỡ hiện tại ${zoomPercent(level)}%, bấm để về 100%`}>{zoomPercent(level)}%</button>
      <button type="button" onClick={onIn} disabled={level <= ZOOM.min} aria-label="Phóng to"><Plus size={15} aria-hidden="true" /></button>
    </div>
  )
}
