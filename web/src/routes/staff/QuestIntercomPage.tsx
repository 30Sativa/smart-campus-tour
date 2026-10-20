import { PageHeader } from '../../components/ui/ConsolePrimitives'
import { StaffPage } from '../../features/staff/StaffUi'
import { QuestIntercomPanel } from '../../features/quest-stream/QuestIntercomPanel'

export default function QuestIntercomPage() {
  return <StaffPage><PageHeader eyebrow="Robot & thiết bị" title="Đàm thoại Quest" description="Nói chuyện với người đang ở gần kính trên robot." />
    <QuestIntercomPanel side="staff" />
    <p className="mt-4 text-sm text-slate-600">Mở /quest/intercom trên trình duyệt của kính và kết nối đầu bên kia.</p>
  </StaffPage>
}
