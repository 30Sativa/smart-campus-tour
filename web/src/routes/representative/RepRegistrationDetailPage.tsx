import { useParams } from 'react-router'
import { useAuthStore } from '../../stores/auth-store'
import { RegistrationWorkspace } from '../../features/representative/components/RegistrationWorkspace'
import { RegistrationDetailContent } from '../../features/representative/components/RegistrationDetailContent'

export default function RepRegistrationDetailPage() {
  const { registrationId } = useParams()
  const owner = useAuthStore(state => state.user?.userId)
  return <RegistrationWorkspace registrationId={registrationId}>{id => <RegistrationDetailContent key={`${owner}:${id}`} registrationId={id} />}</RegistrationWorkspace>
}
