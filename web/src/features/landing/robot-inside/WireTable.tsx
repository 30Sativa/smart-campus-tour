import { WIRES, WIRE_KINDS, component } from './wiring'
import type { Selection } from './WiringMap'

/**
 * Every cable of the drawing as a table, grouped by what it carries: where it
 * goes, what runs through it, its level and the STM32 pins. A row opens the
 * cable on the drawing.
 */
export function WireTable({ selection, onSelect }: { selection: Selection; onSelect: (selection: Selection) => void }) {
  return (
    <div className="lp3-ri-table">
      <table>
        <thead>
          <tr><th scope="col">Đường dây</th><th scope="col">Từ → tới</th><th scope="col">Mang gì</th><th scope="col">Mức điện</th><th scope="col">Chân / đầu nối</th></tr>
        </thead>
        {WIRE_KINDS.map(kind => (
          <tbody key={kind.kind}>
            <tr className="lp3-ri-table__group"><th scope="rowgroup" colSpan={5}><i style={{ background: kind.color }} aria-hidden="true" />{kind.label}</th></tr>
            {WIRES.filter(item => item.kind === kind.kind).map(item => (
              <tr key={item.id} data-selected={selection?.type === 'wire' && selection.id === item.id ? 'true' : undefined}>
                <th scope="row">
                  <button type="button" onClick={() => onSelect({ type: 'wire', id: item.id })}>
                    {item.label}{item.routes.length > 1 ? <span> ×{item.routes.length}</span> : null}
                  </button>
                </th>
                <td>{component(item.from).label} → {component(item.to).label}</td>
                <td>{item.carries}</td>
                <td className="lp3-ri-table__mono">{item.level}</td>
                <td className="lp3-ri-table__mono">{item.pins ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  )
}
