import { NavLink } from 'react-router'
import { VISITOR_BOTTOM_NAV } from '../visitor-content'

/**
 * The phone navigation bar.
 *
 * On a phone the header's burger sheet is two taps to anywhere and hides where
 * you currently are. A visitor using this product is usually walking, holding
 * the phone in one hand, and switching between the same five places — so those
 * five get a permanent bar within thumb reach and the sheet keeps everything
 * else.
 *
 * It is `display: none` above the phone breakpoint, where the header's own link
 * row is already visible and a second navigation would just be a duplicate.
 * The bar sits on the safe-area inset so it clears the home indicator on iOS.
 */
export function VisitorBottomNav() {
  return (
    <nav className="vs-tabbar" aria-label="Visitor navigation">
      {VISITOR_BOTTOM_NAV.map(({ label, path, icon: Icon, end }) => (
        <NavLink key={path} to={path} end={end} className="vs-tabbar__item">
          <span className="vs-tabbar__icon" aria-hidden="true">
            <Icon size={20} strokeWidth={1.9} />
          </span>
          {label}
        </NavLink>
      ))}
    </nav>
  )
}
