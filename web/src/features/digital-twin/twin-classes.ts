/** Class recipes of the Digital Twin toolbars, kept out of component files (fast refresh). */

/** Square icon button of the map toolbar; `on` for a pressed toggle. */
export const twinIconButton = (on: boolean) =>
  `grid size-9 shrink-0 place-items-center rounded-lg border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f8df7] ${on ? 'border-[#bfdbfe] bg-[#eff6ff] text-[#2563eb]' : 'border-[#e2e8f0] bg-white text-[#475569] hover:bg-[#f8fafc] hover:text-[#0f172a]'}`
