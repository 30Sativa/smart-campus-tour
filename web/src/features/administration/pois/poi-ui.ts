/** Hallmark · shape: app screen · theme: existing Staff · signature: map and tabbed inspector · v2.0.0
 * Critique: the old camera column stretched the form; a compact inspector keeps the map in view.
 * Theme block stays in Tailwind, as required by the Staff UI system.
 */
export const poiThemeClass = [
  '[--poi-paper:#ffffff]', '[--poi-ground:#eef3f8]', '[--poi-rule:#dce5ee]',
  '[--poi-ink:#0f172a]', '[--poi-text:#334155]', '[--poi-muted:#5b6b7f]',
  '[--poi-accent:#2d719e]', '[--poi-accent-ink:#1f557a]', '[--poi-soft:#edf3fb]',
  '[--poi-focus:#2563eb]', '[--poi-control:#7b8ca0]', '[--poi-danger:#b42318]',
  '[--poi-warn:#7d5310]', '[--poi-warn-soft:#fffaf0]', '[--poi-warn-rule:#f1dcb0]',
  '[--poi-success:#166534]', '[--poi-danger-soft:#fbeeec]', '[--poi-danger-rule:#f1c9c3]',
  '[--poi-obstacle:#111111]', '[--poi-unknown:#9aa5b1]', '[--poi-landmark:#173b5f]', '[--poi-grid:#eef2f6]',
  '[--poi-landmark-soft:rgba(23,59,95,0.06)]', '[--poi-pose-soft:rgba(37,99,235,0.1)]',
  '[--poi-clearance-soft:rgba(217,119,6,0.16)]', '[--poi-clearance-warn:#b45309]', '[--poi-shadow:rgba(0,0,0,0.04)]',
  '[--poi-head:#94a3b8]', '[--poi-body:#cbd5e1]', '[--poi-visor:#1e293b]', '[--poi-stop:#f59e0b]',
].join(' ')

/** The same Staff form controls, with a visible field edge against the workbench surface. */
export const poiInputClass = 'w-full min-h-10 rounded-xl border border-[var(--poi-control)] bg-[var(--poi-paper)] px-3 py-2 text-sm text-[var(--poi-ink)] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-[var(--poi-muted)] hover:border-[var(--poi-accent)] focus:border-[var(--poi-focus)] focus:ring-2 focus:ring-[var(--poi-focus)]/15 disabled:bg-[var(--poi-soft)] disabled:text-[var(--poi-muted)] aria-[invalid=true]:border-[var(--poi-danger)] aria-[invalid=true]:ring-[var(--poi-danger)]/15 motion-reduce:transition-none'
