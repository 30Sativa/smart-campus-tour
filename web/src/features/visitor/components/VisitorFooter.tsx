import { Link } from 'react-router'

/**
 * One line, on the public footer's ground.
 *
 * `.lp-foot`'s four link columns exist to help someone decide whether to visit.
 * A signed-in visitor has decided, so the app keeps the sunken ground, the
 * hairline above it and the `.lp-meta` type, and drops the columns. Same
 * material, less of it.
 */
export function VisitorFooter({ student = false }: { student?: boolean }) {
  return (
    <footer className="vs-foot">
      <div className="vs-foot__inner">
        <p className="lp-meta">© 2026 CampusTour DT-AMR · FPT University, Ho Chi Minh City campus.</p>
        <nav className="vs-foot__links" aria-label="Footer">
          <Link to="/join">Join a tour</Link>
          {!student && <Link to="/visit/profile">Profile</Link>}
          <Link to="/">Public site</Link>
        </nav>
      </div>
    </footer>
  )
}
