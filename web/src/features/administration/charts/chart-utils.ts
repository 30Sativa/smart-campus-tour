/**
 * The only thing the three administration charts share.
 *
 * Colour, tooltip chrome and two small helpers. No wrapper component and no
 * chart abstraction: each chart composes Recharts directly, so reading one file
 * tells you the whole of that chart.
 *
 * The palette is the dashboard's status vocabulary rather than a chart theme, so
 * a completed tour is the same green here as in a `StatusBadge`.
 */

/**
 * Chart colours, taken from the status tones the rest of the dashboard uses so
 * a completed tour is the same green here as in a `StatusBadge`.
 */
export const CHART_COLORS = {
  completed: '#2f8f6b',
  cancelled: '#c0554a',
  other: '#9aa6b8',
  neutral: '#4f7fca',
  critical: '#c0554a',
  grid: '#e7ecf4',
  axis: '#8792a5',
} as const

/** Shared class for the honest "no data" body inside a chart card. */
export const chartEmptyClass = 'flex min-h-40 items-center justify-center px-5 py-8 text-center text-sm font-medium text-[#8792a5]'

/** Shared class for the small caption under a chart. */
export const chartLegendClass = 'flex flex-wrap items-center gap-x-4 gap-y-1 px-5 pb-4 text-xs text-[#6b7688]'

/**
 * Tooltip chrome shared by the three charts, so a hovered value looks the same
 * everywhere. Spread onto Recharts' `<Tooltip>`.
 */
export const tooltipStyle = {
  contentStyle: {
    borderRadius: 12,
    border: '1px solid #dce9fb',
    boxShadow: '0 10px 30px rgba(69,112,167,0.12)',
    fontSize: 12,
    padding: '8px 12px',
  },
  labelStyle: { fontWeight: 700, color: '#3c4657', marginBottom: 2 },
  itemStyle: { padding: 0 },
} as const

/**
 * A round number at or above `max`, so the tallest bar never touches the top of
 * the plot and the scale reads in whole tours rather than in pixels.
 */
export function niceMax(max: number): number {
  if (max <= 0) return 1
  if (max <= 5) return max + 1
  const step = max <= 20 ? 5 : max <= 100 ? 10 : 50
  return Math.ceil((max + step / 2) / step) * step
}

/** `0.923` to `92%`. Null stays null; the caller decides what to print. */
export function formatPercent(value: number | null): string | null {
  return value == null ? null : `${Math.round(value * 100)}%`
}
