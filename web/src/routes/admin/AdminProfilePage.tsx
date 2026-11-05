import { PageHeader } from '../../components/ui/ConsolePrimitives'
import { AccountSettings } from '../../features/account/AccountSettings'
import { AdminPage } from '../../features/administration/AdminUi'

export default function AdminProfilePage() {
  return (
    <AdminPage>
      <PageHeader eyebrow="Tài khoản" title="Hồ sơ của tôi" description="Xem tài khoản quản trị, sửa họ tên và đổi mật khẩu." />
      <div className="max-w-2xl"><AccountSettings /></div>
    </AdminPage>
  )
}
