import { Hand, MousePointer2, Route, Ruler, Tag } from 'lucide-react'

export type TwinTool = 'select' | 'pan' | 'measure'
export function TwinTools({ tool, onTool, routes, onRoutes, labels, onLabels }: {
  tool: TwinTool; onTool: (tool: TwinTool) => void; routes: boolean; onRoutes: () => void; labels: boolean; onLabels: () => void
}) {
  const buttons = [
    { label: 'Chọn robot', icon: MousePointer2, active: tool === 'select', click: () => onTool('select') },
    { label: 'Di chuyển bản đồ', icon: Hand, active: tool === 'pan', click: () => onTool('pan') },
    { label: 'Hiện tuyến đường', icon: Route, active: routes, click: onRoutes },
    { label: 'Hiện điểm point', icon: Tag, active: labels, click: onLabels },
    { label: 'Đo khoảng cách', icon: Ruler, active: tool === 'measure', click: () => onTool(tool === 'measure' ? 'select' : 'measure') },
  ]
  return <div className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2">
    {tool === 'measure' && <p className="mb-2 rounded-lg bg-slate-900/95 px-3 py-2 text-center text-xs text-white">Nhấn hai điểm trên map để đo. Nhấn tiếp để đo lại.</p>}
    <nav aria-label="Công cụ bản đồ 3D" className="flex gap-1 rounded-xl border border-slate-600 bg-slate-900/95 p-1 shadow-sm">
      {buttons.map(({ label, icon: Icon, active, click }) => <button key={label} type="button" aria-label={label} title={label} aria-pressed={active} onClick={click}
        className={`grid size-10 place-items-center rounded-lg text-slate-200 transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-sky-300 ${active ? 'bg-blue-800 text-white' : 'hover:bg-slate-700'}`}><Icon size={17} aria-hidden="true" /></button>)}
    </nav>
  </div>
}
