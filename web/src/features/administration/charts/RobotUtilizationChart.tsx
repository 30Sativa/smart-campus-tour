import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { RobotUtilisation } from '../admin-analytics'
import { CHART_COLORS, chartEmptyClass, chartLegendClass, tooltipStyle } from './chart-utils'

const ROW_HEIGHT = 44

/**
 * Utilisation per robot, as horizontal bars.
 *
 * `data` is null while no reporting contract carries the metric, and null
 * renders the empty state. Connection state is not substituted: "reachable" and
 * "in use" are different questions, and answering the second with the first
 * would be a fabricated percentage.
 *
 * The chart body below is ready, so the day the metric arrives this file needs a
 * real array and nothing else.
 */
export function RobotUtilizationChart({ data, emptyLabel }: { data: RobotUtilisation[] | null; emptyLabel: string }) {
  if (data == null || data.length === 0) return <p className={chartEmptyClass}>{emptyLabel}</p>

  const average = Math.round(data.reduce((acc, row) => acc + row.percent, 0) / data.length)
  // Round and clamp here so the label can read a plain field: Recharts' label
  // formatter is typed for renderable text, not for a number.
  const rows = data.map((row) => {
    const percent = Math.round(Math.max(0, Math.min(100, row.percent)))
    return { ...row, percent, label: `${percent}%` }
  })

  return (
    <figure className="m-0">
      <figcaption className="sr-only">
        Mức sử dụng AMR. Trung bình {average} phần trăm.
        {rows.map((row) => ` ${row.amrName}: ${row.percent} phần trăm.`).join('')}
      </figcaption>

      <div className="px-2 pt-3">
        <ResponsiveContainer width="100%" height={Math.max(rows.length * ROW_HEIGHT, 120)}>
          <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 34, left: 4, bottom: 4 }} barCategoryGap="28%" accessibilityLayer>
            <CartesianGrid horizontal={false} stroke={CHART_COLORS.grid} />
            <XAxis type="number" domain={[0, 100]} unit="%" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: CHART_COLORS.axis }} />
            <YAxis type="category" dataKey="amrName" width={96} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#3c4657' }} />
            <Tooltip cursor={{ fill: 'rgba(79,127,202,0.06)' }} {...tooltipStyle} />
            <Bar dataKey="percent" name="Mức sử dụng" fill={CHART_COLORS.neutral} radius={[0, 4, 4, 0]} isAnimationActive={false}>
              <LabelList dataKey="label" position="right" offset={8} fontSize={11} fontWeight={700} fill="#6b7688" />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <p className={chartLegendClass}>Trung bình đội {average}%</p>
    </figure>
  )
}
