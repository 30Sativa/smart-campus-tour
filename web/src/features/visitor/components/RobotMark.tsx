/**
 * The project's robot, drawn rather than photographed.
 *
 * The CampusTour robot is a compact two-wheel differential-drive platform, so
 * this is a two-wheel platform: one body, one screen head, two side wheels, one
 * small caster. Not humanoid, not four wheels, nothing sci-fi. It is used
 * wherever a photograph would be wrong (a status panel, an empty state, a chat
 * avatar), so a visitor always sees the machine that will actually meet them.
 *
 * It is a single inline SVG with `currentColor` throughout, which is why it works
 * on the accent ground, on a card and on a photograph without a second asset.
 */
type Props = {
  size?: number
  className?: string
}

export function RobotMark({ size = 40, className }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {/* Head: the screen the assistant speaks from. */}
      <rect x="14" y="7" width="20" height="13" rx="4" />
      <circle cx="20.5" cy="13.5" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="27.5" cy="13.5" r="1.4" fill="currentColor" stroke="none" />
      {/* Neck. */}
      <path d="M24 20v3" />
      {/* Body. */}
      <rect x="12" y="23" width="24" height="14" rx="4" />
      {/* Two drive wheels, one per side: the differential-drive base. */}
      <circle cx="12" cy="34" r="5" />
      <circle cx="36" cy="34" r="5" />
      {/* The trailing caster that keeps a two-wheel base upright. */}
      <path d="M24 37v3" />
      <circle cx="24" cy="42" r="2" />
    </svg>
  )
}
