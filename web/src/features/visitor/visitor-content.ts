/**
 * Every fixed string and label the visitor app shows, plus its navigation table.
 *
 * Kept in one module for the same reason `features/landing/landing-content.ts`
 * exists: wording can be edited without touching layout, and the strings sit in
 * one place for the day the "Preferred language" setting in Profile becomes real.
 *
 * Copy rules for this surface: plain English, no em dashes, no developer
 * vocabulary. A visitor reads "robot", "destination" and "start tour", never
 * "robot allocation", "navigation node" or "execute tour" (web/AGENTS.md §3).
 */
import {
  Bot,
  Calendar,
  CalendarCheck,
  Compass,
  FlaskConical,
  GraduationCap,
  House,
  LayoutGrid,
  LifeBuoy,
  Map,
  MessageCircle,
  PartyPopper,
  Route,
  UtensilsCrossed,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { LocationCategory, NotificationKind, TourType } from '../../api/contracts/visitor'

export const VISITOR_ROOT = '/visit'

export type VisitorNavItem = { label: string; path: string; icon: LucideIcon; end?: boolean }

/**
 * The header links, in the order a visit happens: where am I, what is here, how
 * do I get there, take me there, what have I booked.
 *
 * Five is the ceiling. The landing nav carries five inline links at 68px, and
 * more than that either wraps or shrinks the type, which is what would make the
 * two headers stop looking like the same header. Notifications and the account
 * are actions on the right, not links in this list, exactly as on the landing
 * page.
 */
export const VISITOR_NAV: VisitorNavItem[] = [
  { label: 'Home', path: '/visit', icon: House, end: true },
  { label: 'Explore', path: '/visit/explore', icon: Compass },
  { label: 'Campus map', path: '/visit/map', icon: Map },
  { label: 'Book a robot', path: '/visit/book', icon: Calendar },
  { label: 'My tours', path: '/visit/tours', icon: Route },
]

/** Reachable from the account menu and the mobile sheet, not from the main row. */
export const VISITOR_SECONDARY_NAV: VisitorNavItem[] = [
  { label: 'My bookings', path: '/visit/bookings', icon: CalendarCheck },
  { label: 'Ask the robot', path: '/visit/assistant', icon: MessageCircle },
  { label: 'Profile', path: '/visit/profile', icon: GraduationCap },
  { label: 'Help', path: '/visit/help', icon: LifeBuoy },
]

/**
 * The phone bar.
 *
 * Five slots, because a sixth stops being tappable at 375px, and these five are
 * the visit itself: where am I, what is here, take me there, what have I booked,
 * me. Everything else stays one tap away behind the account menu — the bar is
 * for the things a visitor reaches for while walking, not for the whole map of
 * the product.
 *
 * "Book" is the middle slot on purpose: it is the thumb's easiest reach on a
 * phone held one-handed, and it is the action the product exists for.
 */
export const VISITOR_BOTTOM_NAV: VisitorNavItem[] = [
  { label: 'Home', path: '/visit', icon: House, end: true },
  { label: 'Explore', path: '/visit/explore', icon: Compass },
  { label: 'Book', path: '/visit/book', icon: Calendar },
  { label: 'Tours', path: '/visit/tours', icon: Route },
  { label: 'Profile', path: '/visit/profile', icon: GraduationCap },
]

/* ── Categories ───────────────────────────────────────────────────────────── */

export type CategoryOption = {
  /** `undefined` is the "All" pill: no `category` goes to the API. */
  value?: LocationCategory
  label: string
  icon: LucideIcon
}

export const LOCATION_CATEGORIES: CategoryOption[] = [
  { value: undefined, label: 'All', icon: LayoutGrid },
  { value: 'Classroom', label: 'Classrooms', icon: GraduationCap },
  { value: 'Library', label: 'Library', icon: Compass },
  { value: 'Lab', label: 'Labs', icon: FlaskConical },
  { value: 'Food', label: 'Food', icon: UtensilsCrossed },
  { value: 'StudentServices', label: 'Student services', icon: LifeBuoy },
  { value: 'Event', label: 'Events', icon: PartyPopper },
]

/** Category name for a single place, used on cards and map pins. */
export const CATEGORY_LABEL: Record<LocationCategory, string> = {
  Classroom: 'Classroom',
  Library: 'Library',
  Lab: 'Lab',
  Food: 'Food',
  StudentServices: 'Student services',
  Event: 'Events',
}

/* ── Tour types ───────────────────────────────────────────────────────────── */

export type TourTypeOption = {
  value: TourType
  label: string
  description: string
  icon: LucideIcon
}

export const TOUR_TYPES: TourTypeOption[] = [
  {
    value: 'CampusTour',
    label: 'Campus tour',
    description: 'The full guided route, about 45 minutes, with a stop at every main building.',
    icon: Route,
  },
  {
    value: 'SpecificDestination',
    label: 'Take me to one place',
    description: 'The robot walks you straight to a single destination and leaves you there.',
    icon: Compass,
  },
  {
    value: 'CustomTour',
    label: 'Build my own tour',
    description: 'Pick the places you want to see and the robot links them into one route.',
    icon: Map,
  },
]

export const TOUR_TYPE_LABEL: Record<TourType, string> = {
  CampusTour: 'Campus tour',
  SpecificDestination: 'Single destination',
  CustomTour: 'Custom tour',
}

/* ── Notifications ────────────────────────────────────────────────────────── */

export const NOTIFICATION_KIND: Record<NotificationKind, { label: string; icon: LucideIcon }> = {
  Booking: { label: 'Booking', icon: CalendarCheck },
  Tour: { label: 'Tour', icon: Route },
  Robot: { label: 'Robot', icon: Bot },
  Campus: { label: 'Campus', icon: Compass },
}

/* ── Assistant ────────────────────────────────────────────────────────────── */

export const SUGGESTED_QUESTIONS = [
  'Where is the library?',
  'Where is my classroom?',
  'Where can I get food?',
  'What places should I visit?',
]
