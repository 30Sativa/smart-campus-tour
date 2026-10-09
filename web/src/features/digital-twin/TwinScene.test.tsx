import { Children, isValidElement, type ReactElement, type ReactNode } from 'react'
import { FleetPathLine } from './FleetPaths'
import { describe, expect, it } from 'vitest'
import TwinScene from './TwinScene'

function elements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  return Children.toArray(node).flatMap(child => isValidElement<Record<string, unknown>>(child)
    ? [child, ...elements(child.props.children as ReactNode)] : [])
}

describe('patrol overlays', () => {
  it('keeps the dashed route visible while mounting point markers only when enabled', () => {
    // Inspect the scene composition without a WebGL context; renderer QA runs in Chrome.
    const path = { id: 'R1', color: '#2563eb', points: [{ x: 24, y: -74 }, { x: 24, y: -73 }], active: true }
    const hidden = elements(TwinScene({ robots: [], overhead: false, showLabels: false, syntheticPatrol: true, patrolPaths: [path], seconds: 18 }))
    expect(hidden.filter(node => node.props.fixedLabel)).toHaveLength(0)
    const route = hidden.find(node => node.type === FleetPathLine)
    expect(route?.props.route).toEqual(path)
    expect(route?.props.seconds).toBe(18)
    const visible = elements(TwinScene({ robots: [], overhead: false, showLabels: true, syntheticPatrol: true }))
    expect(visible.filter(node => node.props.fixedLabel).map(node => node.props.number)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'])
  })
})
