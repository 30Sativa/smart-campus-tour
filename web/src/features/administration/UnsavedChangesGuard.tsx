import { useContext, useEffect } from 'react'
import { UNSAFE_DataRouterContext, useBlocker } from 'react-router'
import { ConfirmationDialog } from '../../components/ui/ConfirmationDialog'
import { isAfterSave } from './after-save'

/**
 * Asks before an edit form is left with unsaved changes: closing the tab or reloading goes through the
 * browser's own prompt, and in-app navigation through a confirmation dialog. Pass `when={false}` once
 * the draft is saved, so the navigation that follows a save is not stopped.
 */
export function UnsavedChangesGuard({ when }: { when: boolean }) {
  useEffect(() => {
    if (!when) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault() }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [when])
  // `useBlocker` only works under a data router (the app's `createBrowserRouter`); a plain router has nothing to block with.
  const dataRouter = useContext(UNSAFE_DataRouterContext)
  return dataRouter ? <NavigationPrompt when={when} /> : null
}

function NavigationPrompt({ when }: { when: boolean }) {
  const blocker = useBlocker(({ currentLocation, nextLocation }) =>
    when && currentLocation.pathname !== nextLocation.pathname && !isAfterSave(nextLocation.state))
  if (blocker.state !== 'blocked') return null
  return <ConfirmationDialog open title="Rời trang khi chưa lưu?" confirmLabel="Rời trang" tone="danger" withReason={false}
    description="Các thay đổi chưa lưu sẽ mất."
    onConfirm={() => blocker.proceed()} onCancel={() => blocker.reset()} />
}
