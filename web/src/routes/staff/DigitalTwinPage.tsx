import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router'
import { PageHeader, StaffPage } from '../../features/staff/StaffUi'
import { buttonClass } from '../../features/staff/ui-classes'
import { SimulatorPreview } from '../../features/digital-twin/SimulatorPreview'

/**
 * The single-robot simulator preview (see web/README.md). Not part of the
 * operator's shift - the operational twin lives on Live Operations and the
 * Robot page - so it has no sidebar entry; the Robot page links here.
 */
export default function DigitalTwinPage() {
  return (
    <StaffPage>
      <Link to="/staff/robot" className={`${buttonClass('ghost', 'sm')} mb-3 -ml-2`}><ArrowLeft size={15} aria-hidden="true" />Robot & thiết bị</Link>
      <PageHeader eyebrow="Đội robot" title="Simulator robot" description="Xem trước chuyển động robot trong không gian 3D. Phát thử tuyến demo và theo dõi vị trí trước khi kết nối robot thật." />
      <SimulatorPreview />
    </StaffPage>
  )
}
