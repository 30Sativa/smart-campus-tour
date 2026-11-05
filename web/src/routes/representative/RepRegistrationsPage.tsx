import { useAuthStore } from '../../stores/auth-store'
import { RegistrationWorkspace } from '../../features/representative/components/RegistrationWorkspace'
import { RegistrationDetailContent } from '../../features/representative/components/RegistrationDetailContent'

export default function RepRegistrationsPage() {
  const owner = useAuthStore(state => state.user?.userId)
  return <RegistrationWorkspace>{id => <RegistrationDetailContent key={`${owner}:${id}`} registrationId={id} />}</RegistrationWorkspace>
}
