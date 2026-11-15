import { useSearchParams } from 'react-router'
import { PageHeader } from '../../components/ui/ConsolePrimitives'
import { StaffPage } from '../../features/staff/StaffUi'
import { FleetTwin } from '../../features/staff/components/FleetTwin'

/**
 * Digital Twin: one 3D view, the physical robots first and the local patrol as
 * an optional simulated layer. `?robot=<code>` opens it on that robot; the live
 * mini map and Robot & thiết bị link here with it. `?perf=1` shows the
 * renderer numbers (web/docs/digital-twin-performance.md).
 */
export default function DigitalTwinPage() {
  const [params] = useSearchParams()
  return (
    <StaffPage wide>
      <PageHeader eyebrow="Vận hành" title="Digital Twin" description="Vị trí robot thật trên bản đồ 3D. Robot mô phỏng là lớp phụ, tắt sẵn và tự tắt khi có Tour chạy." />
      <FleetTwin key={params.get('robot') ?? ''} requestedRobot={params.get('robot')} perf={params.get('perf') === '1'} />
    </StaffPage>
  )
}
