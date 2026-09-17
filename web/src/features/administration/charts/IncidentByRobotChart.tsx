import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { IncidentRow } from '../admin-analytics'
import { CHART_COLORS, chartEmptyClass, chartLegendClass, niceMax, tooltipStyle } from './chart-utils'

const ROW_HEIGHT = 44

/**
 * Incidents per robot, as horizontal bars.
 *
 * Critical alerts are stacked inside the same bar rather than given a second
 * row, so the bar length stays "how many incidents" and the red segment answers
 * "how many of them were serious". Both counts are printed, so the split is
 * readable without telling the two fills apart.
 */
export function IncidentByRobotChart({ rows, emptyLabel }: { rows: IncidentRow[]; emptyLabel: string }) {
  const grandTotal = rows.reduce((acc, row) => acc + row.total, 0)
  if (rows.length === 0) return <p className={chartEmptyClass}>{emptyLabel}</p>
  if (grandTotal === 0) return <p className={chartEmptyClass}>Chưa ghi nhận sự cố nào trong dữ liệu hiện có.</p>

  const criticalTotal = rows.reduce((acc, row) => acc + row.critical, 0)
  const max = niceMax(Math.max(...rows.map((row) => row.total)))

  // Split into the two series the bar stacks, so a robot with one critical
  // incident reads as one bar, not as two.
  const data = rows.map((row) => ({ ...row, normal: row.total - row.critical }))

  return (
    <figure className="m-0">
      <figcaption className="sr-only">
        Sự cố theo AMR. Tổng {grandTotal} sự cố, {criticalTotal} nghiêm trọng.
        {rows.map((row) => ` ${row.amrName}: ${row.total} sự cố, ${row.critical} nghiêm trọng.`).join('')}
      </figcaption>

      <div className="px-2 pt-3">
        <ResponsiveContainer width="100%" height={Math.max(rows.length * ROW_HEIGHT, 120)}>
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 28, left: 4, bottom: 4 }} barCategoryGap="28%" accessibilityLayer>
            <CartesianGrid horizontal={false} stroke={CHART_COLORS.grid} />
            <XAxis type="number" domain={[0, max]} allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: CHART_COLORS.axis }} />
            <YAxis type="category" dataKey="amrName" width={96} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#3c4657' }} />
            <Tooltip cursor={{ fill: 'rgba(79,127,202,0.06)' }} {...tooltipStyle} />
            <Bar dataKey="normal" stackId="incident" name="Sự cố khác" fill={CHART_COLORS.neutral} radius={[0, 0, 0, 0]} isAnimationActive={false} />
            <Bar dataKey="critical" stackId="incident" name="Nghiêm trọng" fill={CHART_COLORS.critical} radius={[0, 4, 4, 0]} isAnimationActive={false}>
              <LabelList dataKey="total" position="right" offset={8} fontSize={11} fontWeight={700} fill="#6b7688" />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <p className={chartLegendClass}>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm" style={{ background: CHART_COLORS.neutral }} />
          Sự cố khác {grandTotal - criticalTotal}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm" style={{ background: CHART_COLORS.critical }} />
          Nghiêm trọng {criticalTotal}
        </span>
      </p>
    </figure>
  )
}
