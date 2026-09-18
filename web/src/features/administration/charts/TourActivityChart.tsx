import { useMemo } from 'react'
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { TourActivityDay } from '../admin-analytics'
import { CHART_COLORS, chartEmptyClass, chartLegendClass, niceMax, tooltipStyle } from './chart-utils'

/**
 * Tours per day in the reporting window, completed stacked under cancelled.
 *
 * Presentation only. It is handed days that are already bucketed and never asks
 * where they came from, so the props are the contract between the page and the
 * chart, not this implementation.
 */
export function TourActivityChart({ days, emptyLabel }: { days: TourActivityDay[]; emptyLabel: string }) {
  const rows = useMemo(
    () => days.map((day) => ({ ...day, total: day.completed + day.cancelled + day.other })),
    [days],
  )

  const grandTotal = rows.reduce((acc, row) => acc + row.total, 0)
  if (rows.length === 0 || grandTotal === 0) return <p className={chartEmptyClass}>{emptyLabel}</p>

  const completedTotal = rows.reduce((acc, row) => acc + row.completed, 0)
  const cancelledTotal = rows.reduce((acc, row) => acc + row.cancelled, 0)
  const otherTotal = grandTotal - completedTotal - cancelledTotal
  const max = niceMax(Math.max(...rows.map((row) => row.total)))

  return (
    <figure className="m-0">
      {/* The text alternative. Colour carries nothing on its own: the totals are
          printed over the columns and repeated here for a screen reader. */}
      <figcaption className="sr-only">
        Hoạt động tour {rows.length} ngày gần đây. Tổng {grandTotal} tour, {completedTotal} hoàn thành và{' '}
        {cancelledTotal} đã hủy.
        {rows.map((row) => ` Ngày ${row.label}: ${row.total} tour.`).join('')}
      </figcaption>

      <div className="px-2 pt-1">
        <ResponsiveContainer width="100%" height={236}>
          <BarChart data={rows} margin={{ top: 20, right: 10, left: -20, bottom: 0 }} barCategoryGap="30%" accessibilityLayer>
            <CartesianGrid vertical={false} stroke={CHART_COLORS.grid} />
            <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: CHART_COLORS.axis }} tick={{ fontSize: 11, fill: CHART_COLORS.axis }} />
            <YAxis allowDecimals={false} domain={[0, max]} width={40} tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: CHART_COLORS.axis }} />
            <Tooltip cursor={{ fill: CHART_COLORS.cursor }} {...tooltipStyle} />
            <Bar dataKey="completed" stackId="tour" name="Hoàn thành" fill={CHART_COLORS.completed} isAnimationActive={false} />
            <Bar dataKey="cancelled" stackId="tour" name="Đã hủy" fill={CHART_COLORS.cancelled} isAnimationActive={false}>
              {otherTotal === 0 && (
                <LabelList dataKey="total" position="top" offset={8} fontSize={11} fontWeight={700} fill={CHART_COLORS.ink} />
              )}
            </Bar>
            {otherTotal > 0 && (
              <Bar dataKey="other" stackId="tour" name="Trạng thái khác" fill={CHART_COLORS.other} isAnimationActive={false}>
                <LabelList dataKey="total" position="top" offset={8} fontSize={11} fontWeight={700} fill={CHART_COLORS.ink} />
              </Bar>
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>

      <p className={chartLegendClass}>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm" style={{ background: CHART_COLORS.completed }} />
          Hoàn thành {completedTotal}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm" style={{ background: CHART_COLORS.cancelled }} />
          Đã hủy {cancelledTotal}
        </span>
        {otherTotal > 0 && (
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm" style={{ background: CHART_COLORS.other }} />
            Trạng thái khác {otherTotal}
          </span>
        )}
      </p>
    </figure>
  )
}
