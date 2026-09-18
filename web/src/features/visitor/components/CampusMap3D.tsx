import { Component, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Box, Focus, Layers, Minus, Plus, RotateCcw, View } from 'lucide-react'
import { CAMPUS_MODEL, modelAnchorForPin } from '../campus-model'
import type { CampusModelConfig } from '../campus-model'
import { useThemeStore } from '../../../stores/theme-store'
import type { MapPin } from './CampusMap'
import type { CampusCameraControls, CampusSceneProps } from './CampusMap3DScene'

const CampusScene = lazy(() => import('./CampusMap3DScene'))

class ModelErrorBoundary extends Component<{ children: ReactNode; onRetry: () => void }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    if (this.state.failed) return <div className="vs-model-state" role="alert">
      <Box size={32} aria-hidden="true" />
      <h3 className="vs-h3">The campus model could not be opened</h3>
      <p>Please try again. You can still find places and book a visit from the list.</p>
      <button type="button" className="lp-btn lp-btn--ghost lp-btn--sm" onClick={this.props.onRetry}>Try loading again</button>
    </div>
    return this.props.children
  }
}

export function CampusMap3D({ pins, selectedId, onSelect, config = CAMPUS_MODEL }: {
  pins: MapPin[]
  selectedId: string | null
  onSelect: (id: string) => void
  config?: CampusModelConfig
}) {
  const cameraRef = useRef<CampusCameraControls>(null)
  const root = useRef<HTMLDivElement>(null)
  const theme = useThemeStore((state) => state.theme)
  const [colors, setColors] = useState<CampusSceneProps['colors'] | null>(null)
  const [ready, setReady] = useState(false)
  const [topView, setTopView] = useState(false)
  const [showLabels, setShowLabels] = useState(true)
  const [attempt, setAttempt] = useState(0)
  const onReady = useCallback(() => setReady(true), [])
  const modelConfig = useMemo(() => ({ ...config, url: attempt ? `${config.url}${config.url.includes('?') ? '&' : '?'}retry=${attempt}` : config.url }), [config, attempt])
  const selected = pins.find((pin) => pin.id === selectedId)
  const selectedIsPlaced = selected && modelAnchorForPin(selected, config) !== null
  const placedCount = pins.filter((pin) => modelAnchorForPin(pin, config) !== null).length
  const supports3D = typeof window.WebGL2RenderingContext !== 'undefined'

  useEffect(() => {
    // Read the actual visitor tokens after ThemeProvider updates the DOM. The
    // canvas does not introduce a second light/dark palette.
    const frame = requestAnimationFrame(() => {
      if (!root.current) return
      const styles = getComputedStyle(root.current)
      setColors({ surface: styles.getPropertyValue('--lp-surface').trim(), ink: styles.getPropertyValue('--lp-ink').trim(), accent: styles.getPropertyValue('--lp-accent').trim() })
    })
    return () => cancelAnimationFrame(frame)
  }, [theme])

  return <section className="vs-card vs-model" ref={root} aria-label="3D campus map">
    <div className="vs-model__toolbar">
      <div className="vs-model__title"><Box size={18} aria-hidden="true" /><span>Campus in 3D</span></div>
      <div className="vs-model__views" role="group" aria-label="Camera view">
        <button type="button" className="vs-pill" aria-pressed={!topView} disabled={!ready} onClick={() => setTopView(false)}>3D view</button>
        <button type="button" className="vs-pill" aria-pressed={topView} disabled={!ready} onClick={() => setTopView(true)}><View size={15} aria-hidden="true" />Top view</button>
      </div>
    </div>
    <div className="vs-model__viewport">
      <ModelErrorBoundary key={attempt} onRetry={() => { setReady(false); setAttempt((value) => value + 1) }}>
        {!supports3D ? <div className="vs-model-state" role="status">
          <Box size={32} aria-hidden="true" /><h3 className="vs-h3">3D is unavailable on this device</h3>
          <p>Use a browser with WebGL enabled to explore the model. The location list and booking links are still available.</p>
        </div> : !colors ? <div className="vs-model-state" role="status">Preparing the 3D view…</div> :
          <Suspense fallback={<div className="vs-model-state" role="status">Loading the 3D viewer…</div>}>
            <CampusScene config={modelConfig} pins={pins} selectedId={selectedId} onSelect={onSelect} cameraRef={cameraRef}
              topView={topView} showLabels={showLabels} colors={colors} onReady={onReady} />
          </Suspense>}
      </ModelErrorBoundary>
      <div className="vs-model__controls" role="group" aria-label="Map controls">
        <button className="vs-iconbtn" type="button" aria-label="Zoom in" title="Zoom in" disabled={!ready} onClick={() => cameraRef.current?.zoom(0.8)}><Plus size={18} /></button>
        <button className="vs-iconbtn" type="button" aria-label="Zoom out" title="Zoom out" disabled={!ready} onClick={() => cameraRef.current?.zoom(1.25)}><Minus size={18} /></button>
        <button className="vs-iconbtn" type="button" aria-label="Fit campus to view" title="Fit campus to view" disabled={!ready} onClick={() => cameraRef.current?.overview(topView)}><RotateCcw size={17} /></button>
        <button className="vs-iconbtn" type="button" aria-label="Focus selected place" title={selectedIsPlaced ? 'Focus selected place' : 'Select a place positioned on the model first'} disabled={!ready || !selectedIsPlaced} onClick={() => cameraRef.current?.focus()}><Focus size={18} /></button>
        <button className="vs-iconbtn" type="button" aria-label="Show location labels" title="Show location labels" aria-pressed={showLabels} disabled={!ready || placedCount === 0} onClick={() => setShowLabels((value) => !value)}><Layers size={17} /></button>
      </div>
      {ready && <p className="vs-model__gesture">{topView ? 'Drag to pan · Scroll to zoom' : 'Drag to rotate · Right-drag to pan · Scroll to zoom'}<span>Touch: pinch to zoom · Two fingers to pan</span></p>}
    </div>
    <div className="vs-model__caption" role="status">
      <span className="vs-model__caption-icon"><Box size={16} aria-hidden="true" /></span>
      <p>{selected ? selectedIsPlaced ? `${selected.name} is highlighted. Use Focus to take a closer look.` : `${selected.name} has not been placed on this model yet. Its details and booking options are available below.` : 'Explore the campus model, then choose a place from the list to see its details.'}</p>
    </div>
  </section>
}
