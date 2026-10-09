import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router'
import { PageHeader, StaffPage } from '../../features/staff/StaffUi'
import { buttonClass } from '../../features/staff/ui-classes'
import { SimulatorPreview } from '../../features/digital-twin/SimulatorPreview'
import { PhysicalRobotTwin } from '../../features/digital-twin/PhysicalRobotTwin'
import { OperationalTwin } from '../../features/staff/components/OperationalTwin'

/**
 * Local fleet workbench, with separate physical preparation and legacy
 * simulator previews below. The Robot page links here for the wider view.
 */
export default function DigitalTwinPage() {
  return (
    <StaffPage wide>
      <Link to="/staff/robot" className={`${buttonClass('ghost', 'sm')} mb-3 -ml-2`}><ArrowLeft size={15} aria-hidden="true" />Robot & thiết bị</Link>
      <PageHeader eyebrow="Đội robot" title="Digital Twin" description="6 robot · 10 điểm · Điều phối, Copilot cục bộ, camera ảo và thử nghiệm kịch bản. Kết nối miniPC thật được chuẩn bị riêng bên dưới." />
      <OperationalTwin robots={[]} className="mb-6 h-[820px]" />
      <PhysicalRobotTwin />
      <SimulatorPreview />
    </StaffPage>
  )
}
