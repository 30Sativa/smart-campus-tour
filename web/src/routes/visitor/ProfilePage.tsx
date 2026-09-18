import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { KeyRound, LogOut } from 'lucide-react'
import type { PreferredLanguage } from '../../api/contracts/visitor'
import { AuthField } from '../../auth/AuthFields'
import { useLogout } from '../../auth/use-logout'
import { PageHeader } from '../../features/visitor/components/PageHeader'
import { ErrorState, LoadingPanel } from '../../features/visitor/components/States'
import { useUpdateProfile, useVisitorProfile } from '../../features/visitor/visitor-hooks'
import { initials } from '../../features/visitor/visitor-format'

/**
 * The visitor's own details.
 *
 * The form is the sign-in form's form: `AuthField` from `auth/AuthFields.tsx`
 * unchanged, which brings the real `<label htmlFor>`, the `aria-describedby`
 * wiring, the reserved message slot that stops the layout jumping on blur, and
 * the `.auth-submit` button. Nothing about inputs is re-decided here.
 *
 * Email is shown and not editable: changing the address a session is keyed to is
 * an account operation with its own verification flow, and pretending a text
 * field does it would be a lie. Same for the password, which is a link to a flow
 * that does not exist yet and says so.
 */
type ProfileForm = {
  fullName: string
  phone: string
}

const LANGUAGES: Array<{ value: PreferredLanguage; label: string }> = [
  { value: 'en', label: 'English' },
  { value: 'vi', label: 'Tiếng Việt' },
]

const TOGGLES = [
  { key: 'notifyTourUpdates', label: 'Tour updates', desc: 'Where your robot is and when it will reach the next stop.' },
  { key: 'notifyBookingReminders', label: 'Booking reminders', desc: 'A reminder the day before a tour you have booked.' },
  { key: 'notifyCampusNews', label: 'Campus news', desc: 'Showcases, open days and anything new worth walking to.' },
] as const

export default function ProfilePage() {
  const logout = useLogout()
  const query = useVisitorProfile()
  const update = useUpdateProfile()
  const [saved, setSaved] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty, dirtyFields },
  } = useForm<ProfileForm>({ mode: 'onTouched', defaultValues: { fullName: '', phone: '' } })

  // The form is filled from the server once the query lands, and reset rather
  // than patched, so `isDirty` keeps telling the truth about unsaved edits.
  useEffect(() => {
    if (query.data) reset({ fullName: query.data.fullName, phone: query.data.phone ?? '' }, { keepDirtyValues: true })
  }, [query.data, reset])

  useEffect(() => {
    if (!saved) return
    const id = window.setTimeout(() => setSaved(false), 4000)
    return () => window.clearTimeout(id)
  }, [saved])

  if (query.isPending) {
    return (
      <div className="vs-page">
        <LoadingPanel minHeight={420} />
      </div>
    )
  }

  if (query.isError) {
    return (
      <div className="vs-page">
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      </div>
    )
  }

  const profile = query.data

  const save = (values: ProfileForm) => {
    update.mutate(
      { fullName: values.fullName.trim(), phone: values.phone.trim() || null },
      { onSuccess: (profile) => { reset({ fullName: profile.fullName, phone: profile.phone ?? '' }); setSaved(true) } },
    )
  }

  const setLanguage = (language: PreferredLanguage) => update.mutate({ preferredLanguage: language }, { onSuccess: () => setSaved(true) })

  const toggle = (key: (typeof TOGGLES)[number]['key']) => update.mutate({ [key]: !profile[key] }, { onSuccess: () => setSaved(true) })

  return (
    <div className="vs-page vs-stack">
      <PageHeader eyebrow="Profile" title="Your profile" description="Your details, the language the robot speaks to you, and what you want to hear about." />
      <div className="vs-profile-welcome"><span className="vs-avatar vs-avatar--lg" aria-hidden="true">{initials(profile.fullName)}</span><div className="vs-min"><h2 className="vs-h3">{profile.fullName}</h2><p className="vs-lead">Your campus visits, your way.</p><p className="vs-card__meta">{profile.email}</p></div></div>

      <div className="vs-split">
        <div className="vs-col">
          <section className="vs-card vs-card--pad" aria-labelledby="your-details">
            <h2 className="vs-h3" id="your-details">
              Your details
            </h2>

            {saved && (
              <p className="vs-badge vs-badge--ok" role="status" style={{ marginTop: 14 }}>
                Saved
              </p>
            )}
            {update.isError && (
              <div className="auth-alert" role="alert" style={{ marginTop: 14 }}>
                We could not save that. Check your connection and try again.
              </div>
            )}

            <form className="auth-form" onSubmit={handleSubmit(save)} noValidate style={{ marginTop: 20 }}>
              <AuthField
                label="Full name"
                autoComplete="name"
                placeholder="Your name"
                disabled={update.isPending}
                error={errors.fullName?.message}
                {...register('fullName', { required: 'Please enter your name', validate: (value) => Boolean(value.trim()) || 'Please enter your name' })}
              />

              <AuthField
                label="Phone"
                type="tel"
                autoComplete="tel"
                placeholder="Optional"
                disabled={update.isPending}
                error={errors.phone?.message}
                {...register('phone', {
                  pattern: { value: /^[\d\s+()-]{6,}$/, message: 'Use digits, spaces and + ( ) - only' },
                })}
              />

              <AuthField label="Email" value={profile.email} readOnly disabled autoComplete="email" />
              <p className="lp-meta" style={{ marginTop: -14, marginBottom: 20 }}>
                Your sign-in address. Contact student services to change it.
              </p>

              <button
                type="submit"
                className="auth-submit"
                disabled={update.isPending || !isDirty || Object.keys(dirtyFields).length === 0}
                aria-busy={update.isPending}
              >
                {update.isPending && <span className="auth-spinner" aria-hidden="true" />}
                {update.isPending ? 'Saving...' : 'Save changes'}
              </button>
            </form>
          </section>

          <section className="vs-card vs-card--pad" aria-labelledby="notify">
            <h2 className="vs-h3" id="notify">
              Notifications
            </h2>
            <p className="vs-lead">Choose what the campus is allowed to tell you.</p>
            <div style={{ marginTop: 10 }}>
              {TOGGLES.map(({ key, label, desc }) => (
                <button
                  key={key}
                  type="button"
                  role="switch"
                  className="vs-toggle"
                  aria-checked={profile[key]}
                  onClick={() => toggle(key)}
                  disabled={update.isPending}
                >
                  <span className="vs-min">
                    <span className="vs-toggle__label">{label}</span>
                    <span className="vs-toggle__desc">{desc}</span>
                  </span>
                  <span className="vs-switch" aria-hidden="true" />
                </button>
              ))}
            </div>
          </section>
        </div>

        <aside className="vs-rail">
          <section className="vs-card vs-card--pad" aria-labelledby="account">
            <h2 className="vs-h3" id="account">
              Account
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 16 }}>
              <span className="vs-avatar vs-avatar--lg" aria-hidden="true">
                {initials(profile.fullName)}
              </span>
              <div className="vs-min">
                <p className="vs-card__title" style={{ fontSize: '1rem' }}>
                  {profile.fullName}
                </p>
                <p className="vs-card__meta">CampusTour member</p>
              </div>
            </div>

            <div className="vs-card__foot" style={{ paddingTop: 20 }}>
              <button type="button" className="lp-btn lp-btn--ghost lp-btn--sm" disabled title="Password changes arrive with the account service">
                <KeyRound size={15} strokeWidth={2} aria-hidden="true" />
                Change password
              </button>
              <button type="button" className="lp-btn lp-btn--ghost lp-btn--sm" onClick={logout}>
                <LogOut size={15} strokeWidth={2} aria-hidden="true" />
                Sign out
              </button>
            </div>
            <p className="vs-card__meta">To change your password, contact student services.</p>
          </section>

          <section className="vs-card vs-card--pad" aria-labelledby="language">
            <h2 className="vs-h3" id="language">
              Preferred language
            </h2>
            <p className="vs-lead">The language the robot speaks and writes in during a tour.</p>
            <div className="vs-pills" style={{ marginTop: 16 }} role="group" aria-label="Preferred language">
              {LANGUAGES.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  className="vs-pill"
                  aria-pressed={profile.preferredLanguage === value}
                  onClick={() => setLanguage(value)}
                  disabled={update.isPending}
                >
                  {label}
                </button>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  )
}
