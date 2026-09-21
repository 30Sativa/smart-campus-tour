import { Link } from 'react-router'
import { CalendarCheck, Mail, MapPin, MessageCircle, Phone, Route, ShieldCheck } from 'lucide-react'
import { PageHeader } from '../../features/visitor/components/PageHeader'
import { SectionOpen } from '../../features/visitor/components/SectionOpen'
import { RobotMark } from '../../features/visitor/components/RobotMark'

/**
 * Help and support.
 *
 * Everything on this page is static and deliberately so: how a robot tour works
 * does not come from an endpoint, and the contact details are the university's
 * own, the same ones the public footer prints. Nothing here pretends to be a
 * ticketing system — there is no support-desk contract, so the page hands a
 * visitor a phone number and an address rather than a form that goes nowhere.
 *
 * The FAQ is a native `<details>` list: it is keyboard accessible and
 * searchable by the browser's own find-in-page without a line of JavaScript.
 */
const STEPS = [
  { icon: CalendarCheck, title: 'Register a group', text: 'Choose a scheduled tour, enter the school contact and upload an Excel student list.' },
  { icon: RobotMark, title: 'Wait for approval', text: 'The administrator reviews the roster. Your representative receives the join link and group code after approval.' },
  { icon: Route, title: 'Join remotely', text: 'Students open the invitation and enter their name and class. No account or OTP is needed.' },
  { icon: MapPin, title: 'Follow the tour', text: 'Watch the shared view and ask private questions. Staff operates the robot; the tour finishes after its return is confirmed.' },
]
const FAQ = [
  { q: 'Can I edit or cancel a registration?', a: 'Only while the tour is scheduled. Submitted, approved and rejected registrations may be cancelled. Replacing a roster requires approval again.' },
  { q: 'Can I still see my registration after it is locked?', a: 'Yes. My registrations keeps the status and join information available after the tour is ready, running or ended.' },
  { q: 'Why can a student not join?', a: 'Check the invitation, name and class with the representative. The registration must be approved. Students do not see internal rejection reasons.' },
  { q: 'Who controls the robot?', a: 'Staff starts the tour, holds at a stopped observation point and handles recovery. Students cannot change the destination or pause the robot.' },
  { q: 'When does live participation open?', a: 'Approved students wait until Staff starts the tour. Live content and private questions close when the tour ends or participation is revoked.' },
  { q: 'Does this preview send emails or stream video?', a: 'No. It uses in-memory mock data in this tab. Reloading resets the demo; video, voice and real robot control are not connected.' },
]

export default function HelpPage() {
  return (
    <div className="vs-page vs-stack vs-stack--editorial">
      <PageHeader
        eyebrow="Help"
        title="Help and support"
        description="How a robot tour works, answers to the questions we get most, and who to contact if something is not right."
        actions={
          <Link to="/join" className="lp-btn lp-btn--solid lp-btn--sm">
            <MessageCircle size={16} strokeWidth={2} aria-hidden="true" />
            Join a tour
          </Link>
        }
      />

      <section aria-labelledby="how-it-works" data-visitor-reveal>
        <SectionOpen eyebrow="How it works" title="How a robot tour works" id="how-it-works" />
        <ol className="vs-grid vs-grid--4 vs-howto">
          {STEPS.map(({ icon: Icon, title, text }, index) => (
            <li key={title} className="vs-howto__step">
              <span className="vs-howto__n">{String(index + 1).padStart(2, '0')}</span>
              <span className="vs-choice__icon" aria-hidden="true">
                <Icon size={19} strokeWidth={1.9} />
              </span>
              <h3 className="vs-card__title">{title}</h3>
              <p className="vs-card__text">{text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="faq" data-visitor-reveal>
        <SectionOpen eyebrow="Questions" title="Frequently asked" id="faq" />
        <div className="vs-card">
          {FAQ.map(({ q, a }) => (
            <details key={q} className="vs-faq">
              <summary>{q}</summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </section>

      <section aria-labelledby="contact" data-visitor-reveal>
        <SectionOpen eyebrow="Contact" title="Still need a person" id="contact" />
        <div className="vs-grid vs-grid--3">
          <article className="vs-card vs-card--pad">
            <span className="vs-choice__icon" aria-hidden="true">
              <Phone size={19} strokeWidth={1.9} />
            </span>
            <h3 className="vs-card__title" style={{ marginTop: 16 }}>
              Campus desk
            </h3>
            <p className="vs-card__text">Weekdays, 08:00 to 17:00.</p>
            <div className="vs-card__foot">
              <a href="tel:+842873005588" className="lp-btn lp-btn--ghost lp-btn--sm">
                (028) 7300 5588
              </a>
            </div>
          </article>

          <article className="vs-card vs-card--pad">
            <span className="vs-choice__icon" aria-hidden="true">
              <Mail size={19} strokeWidth={1.9} />
            </span>
            <h3 className="vs-card__title" style={{ marginTop: 16 }}>
              Email us
            </h3>
            <p className="vs-card__text">We usually reply within one working day.</p>
            <div className="vs-card__foot">
              <a href="mailto:tuyensinhhcm@fpt.edu.vn" className="lp-btn lp-btn--ghost lp-btn--sm">
                Send an email
              </a>
            </div>
          </article>

          <article className="vs-card vs-card--pad">
            <span className="vs-choice__icon" aria-hidden="true">
              <ShieldCheck size={19} strokeWidth={1.9} />
            </span>
            <h3 className="vs-card__title" style={{ marginTop: 16 }}>
              Your privacy
            </h3>
            <p className="vs-card__text">
              A tour records the route the robot walked so you can look it up later. It does not
              record audio or video.
            </p>
          </article>
        </div>
      </section>
    </div>
  )
}
