/**
 * Drawn illustrations for the places the photo set has nothing honest to show.
 * Both use the page palette and scale with their container.
 */

/** Route with three POIs; a marker drives it, pausing at each stop. */
export function RouteMap({ label }: { label: string }) {
  return (
    <svg viewBox="0 0 300 360" role="img" aria-label={label} preserveAspectRatio="xMidYMid slice">
      <rect width="300" height="360" fill="#1c1c1c" />
      <path d="M0 60H300M0 120H300M0 180H300M0 240H300M0 300H300M60 0V360M120 0V360M180 0V360M240 0V360" stroke="rgba(255,255,255,.07)" />
      <rect x="24" y="36" width="96" height="70" rx="6" fill="#262626" />
      <rect x="176" y="120" width="100" height="84" rx="6" fill="#262626" />
      <rect x="26" y="232" width="110" height="90" rx="6" fill="#262626" />
      <path
        id="hm-route"
        d="M60 330 C60 250 170 280 200 250 S 250 170 220 150 S 90 170 80 120 S 150 60 250 50"
        fill="none"
        stroke="#bde74e"
        strokeWidth="2"
        strokeDasharray="6 7"
      />
      <g fontFamily="ui-monospace, monospace" fontSize="10" fill="#fff">
        <circle cx="60" cy="330" r="6" fill="#fff" /><text x="72" y="334">XUẤT PHÁT</text>
        <circle cx="200" cy="250" r="8" fill="#bde74e" /><text x="148" y="275">POI 1 · AI LAB</text>
        <circle cx="220" cy="150" r="8" fill="#bde74e" /><text x="186" y="112">POI 2 · THƯ VIỆN</text>
        <circle cx="80" cy="120" r="8" fill="#bde74e" /><text x="30" y="150">POI 3 · SÁNG TẠO</text>
        <circle cx="250" cy="50" r="6" fill="#fff" /><text x="190" y="30">KẾT THÚC</text>
      </g>
      <g>
        <circle r="11" fill="#fff" />
        <circle r="5" fill="#1c1c1c" />
        <animateMotion
          dur="9s"
          repeatCount="indefinite"
          keyPoints="0;0;.3;.3;.55;.55;.8;.8;1;1"
          keyTimes="0;.06;.24;.34;.5;.6;.76;.86;.98;1"
          calcMode="linear"
        >
          <mpath href="#hm-route" />
        </animateMotion>
      </g>
    </svg>
  )
}

/** TourState lifecycle, with the operational flag drawn beside RUNNING. */
export function TourStateDiagram({ label }: { label: string }) {
  return (
    <svg viewBox="0 0 400 300" role="img" aria-label={label} preserveAspectRatio="xMidYMid slice">
      <rect width="400" height="300" fill="#f0f0eb" />
      <g stroke="#7e7f85" strokeWidth="1.4" fill="none">
        <path d="M130 78h18M240 78h18M300 96l-50 92M270 96C200 150 140 150 100 188M80 96v92" />
      </g>
      <g fontFamily="ui-monospace, monospace" fontSize="12" textAnchor="middle">
        <rect x="30" y="60" width="100" height="36" rx="18" fill="#fff" stroke="#c6c7cc" /><text x="80" y="82" fill="#4a4f59">SCHEDULED</text>
        <rect x="150" y="60" width="90" height="36" rx="18" fill="#fff" stroke="#c6c7cc" /><text x="195" y="82" fill="#4a4f59">READY</text>
        <rect x="260" y="60" width="110" height="36" rx="18" fill="#1c1c1c" /><text x="315" y="82" fill="#bde74e">RUNNING</text>
        <rect x="170" y="190" width="120" height="36" rx="18" fill="#bde74e" /><text x="230" y="212" fill="#1c1c1c">COMPLETED</text>
        <rect x="30" y="190" width="120" height="36" rx="18" fill="#fff" stroke="#c6c7cc" /><text x="90" y="212" fill="#4a4f59">CANCELLED</text>
        <rect x="248" y="124" width="138" height="28" rx="6" fill="#fff" stroke="#e0a02a" strokeDasharray="4 3" /><text x="317" y="142" fill="#a06a00" fontSize="10">NEEDS_ASSISTANCE</text>
      </g>
    </svg>
  )
}
