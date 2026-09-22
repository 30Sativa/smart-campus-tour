/**
 * What the administration dashboard asks of Admin, derived from the server's
 * own answers (`counts`, `readyBlockers`, `allowedActions`). Nothing here
 * decides a rule; it only picks what to put in front of Admin first.
 */
import type { AdminRegistration, AdminTour } from '../../api/contracts/admin'
import { dayKey, untilText } from './admin-format'

export type AdminTask = {
  id: string
  tone: 'warn' | 'info' | 'ok'
  title: string
  detail?: string
  to: string
  actionLabel: string
  rank: number
  at: string
}

const SOON_MS = 48 * 60 * 60_000

export function buildAdminTasks(tours: AdminTour[], pending: AdminRegistration[], now: number = Date.now()): AdminTask[] {
  const tasks: AdminTask[] = []

  for (const reg of pending) {
    if (reg.state !== 'Submitted' || reg.tourState !== 'Scheduled') continue
    tasks.push({
      id: `reg:${reg.id}`,
      tone: 'warn',
      title: reg.resubmittedAfterApproval ? `${reg.schoolName} cập nhật danh sách, cần duyệt lại` : `${reg.schoolName} chờ duyệt`,
      detail: `${reg.tourCode} · ${reg.tourName}, ${reg.studentCount} học sinh`,
      to: `/admin/registrations/pending?review=${reg.id}`,
      actionLabel: 'Duyệt ngay',
      rank: 1,
      at: reg.submittedAt,
    })
  }

  for (const tour of tours) {
    const soon = new Date(tour.scheduledAt).getTime() - now < SOON_MS
    if (tour.state === 'Scheduled' && tour.allowedActions.finalize.allowed) {
      tasks.push({ id: `final:${tour.id}`, tone: 'ok', title: `${tour.code} đủ điều kiện chốt`, detail: `${tour.name}, ${untilText(tour.scheduledAt, now)}, ${tour.counts.approved} đoàn đã duyệt`, to: `/admin/tours/${tour.id}`, actionLabel: 'Mở Tour', rank: 2, at: tour.scheduledAt })
    } else if (tour.state === 'Scheduled' && soon) {
      const others = tour.readyBlockers.filter((line) => !line.includes('chờ duyệt'))
      if (others.length || tour.counts.submitted === 0) {
        tasks.push({ id: `prep:${tour.id}`, tone: 'warn', title: `${tour.code} bắt đầu ${untilText(tour.scheduledAt, now)} nhưng chưa sẵn sàng`, detail: tour.readyBlockers.join(' · '), to: `/admin/tours/${tour.id}`, actionLabel: 'Xem', rank: 3, at: tour.scheduledAt })
      }
    }
    if ((tour.state === 'Scheduled' || tour.state === 'Ready') && tour.invitationsPending > 0) {
      tasks.push({ id: `mail:${tour.id}`, tone: 'info', title: `${tour.code}: ${tour.invitationsPending} đoàn chưa được gửi thông tin tham gia`, detail: tour.name, to: `/admin/tours/${tour.id}?tab=registrations`, actionLabel: 'Mở Tour', rank: 4, at: tour.scheduledAt })
    }
  }

  return tasks.sort((a, b) => a.rank - b.rank || a.at.localeCompare(b.at))
}

export type AdminCounts = { toursToday: number; pending: number; ready: number; needsPreparation: number; invitationsPending: number }

export function adminCounts(tours: AdminTour[], now: Date = new Date()): AdminCounts {
  const today = dayKey(now)
  const upcoming = tours.filter((tour) => tour.state === 'Scheduled' || tour.state === 'Ready')
  return {
    toursToday: tours.filter((tour) => dayKey(new Date(tour.scheduledAt)) === today).length,
    pending: upcoming.reduce((sum, tour) => sum + (tour.state === 'Scheduled' ? tour.counts.submitted : 0), 0),
    ready: tours.filter((tour) => tour.state === 'Ready').length,
    needsPreparation: tours.filter((tour) => tour.state === 'Scheduled' && !tour.allowedActions.finalize.allowed).length,
    invitationsPending: upcoming.reduce((sum, tour) => sum + tour.invitationsPending, 0),
  }
}
