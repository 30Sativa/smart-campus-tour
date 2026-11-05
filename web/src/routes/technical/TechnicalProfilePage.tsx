import { PageHeader } from '../../components/ui/ConsolePrimitives'
import { AccountSettings } from '../../features/account/AccountSettings'
import { TechnicalPage } from '../../features/technical/TechnicalUi'

export default function TechnicalProfilePage() {
  return (
    <TechnicalPage>
      <PageHeader eyebrow="Tài khoản" title="Hồ sơ của tôi" description="Xem tài khoản kỹ thuật, sửa họ tên và đổi mật khẩu." />
      <div className="max-w-2xl"><AccountSettings /></div>
    </TechnicalPage>
  )
}
