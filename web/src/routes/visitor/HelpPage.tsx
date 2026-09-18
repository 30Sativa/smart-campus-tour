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
  {
    icon: CalendarCheck,
    title: 'Book a robot',
    text: 'Pick a date, a time and where you want to meet. You will get a booking reference straight away.',
  },
  {
    icon: RobotMark,
    title: 'Meet your robot',
    text: 'Your robot waits at the meeting point you chose. Show your booking reference and it will greet you by name.',
  },
  {
    icon: Route,
    title: 'Walk the tour',
    text: 'It leads at walking pace and stops at each destination. Ask it anything along the way, or pause whenever you like.',
  },
  {
    icon: MapPin,
    title: 'Finish anywhere',
    text: 'End the tour when you are done. The robot returns to its charging point on its own.',
  },
]

const FAQ = [
  {
    q: 'Do I need to book in advance?',
    a: 'Booking ahead guarantees a robot is free when you arrive. If one happens to be available you can also start a tour on the day from the Explore screen.',
  },
  {
    q: 'How long does a campus tour take?',
    a: 'The full guided route is about 45 minutes. A single destination is usually under 10 minutes, and a custom tour depends on how many places you pick.',
  },
  {
    q: 'Can I change or cancel my booking?',
    a: 'Yes. Open My bookings, choose the booking and cancel it. There is no charge and no deadline, though cancelling early frees the robot for someone else.',
  },
  {
    q: 'What if the robot has not arrived?',
    a: 'Check the Active tour screen — it shows where your robot is and roughly how long it needs. If nothing is showing, contact the campus desk below.',
  },
  {
    q: 'Can the robot take me somewhere not on the tour?',
    a: 'Ask it. The campus assistant understands plain questions like "take me to the library" and will re-route if that destination is reachable.',
  },
  {
    q: 'Is the route step-free?',
    a: 'The robot only uses step-free paths, so every route it walks is accessible. Individual buildings list their own access details on their location page.',
  },
]

export default function HelpPage() {
  return (
    <div className="vs-page vs-stack vs-stack--editorial">
      <PageHeader
        eyebrow="Help"
        title="Help and support"
        description="How a robot tour works, answers to the questions we get most, and who to contact if something is not right."
        actions={
          <Link to="/visit/assistant" className="lp-btn lp-btn--solid lp-btn--sm">
            <MessageCircle size={16} strokeWidth={2} aria-hidden="true" />
            Ask the robot
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
