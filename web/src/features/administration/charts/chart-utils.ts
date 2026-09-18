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
 * Chart colours.
 *
 * Two groups, and the difference matters. The first four are the dashboard's
 * *status* vocabulary: a completed tour is the same green here as in a
 * `StatusBadge`, so those never move with a visual refresh. The rest is chrome —
 * grid, axis, ink, the neutral series and the hover cursor — and that is the
 * console's own palette, shared with operations since administration moved onto
 * it on 2026-09-18.
 */
export const CHART_COLORS = {
  // Status. Bound to features/operations/status.ts, not to the chrome.
  completed: '#2f8f6b',
  cancelled: '#c0554a',
  other: '#9aa6b8',
  critical: '#c0554a',

  // Chrome. The operations palette.
  neutral: '#5b91ed',
  grid: '#edf2fa',
  axis: '#71819a',
  ink: '#40546f',
  inkMuted: '#71819a',
  cursor: 'rgba(91,145,237,0.07)',
} as const

/** Shared class for the honest "no data" body inside a chart card. */
export const chartEmptyClass = 'flex min-h-40 items-center justify-center px-5 py-8 text-center text-sm font-medium text-[#71819a]'

/** Shared class for the small caption under a chart. */
export const chartLegendClass = 'flex flex-wrap items-center gap-x-4 gap-y-1 px-5 pb-4 text-xs text-[#647793]'

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
  labelStyle: { fontWeight: 700, color: '#1f314d', marginBottom: 2 },
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
