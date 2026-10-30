import { useParams } from 'react-router'
import { StudentHeader } from '../../features/student/components/StudentHeader'
import { StudentInvitationPage } from '../../features/student/invitation/StudentInvitationPage'
import '../../features/landing/landing.css'
import '../../features/student/student.css'
import '../../features/student/student-expedition.css'

const TOUR_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A Tour opens only from the link in an invitation email; the URL itself grants nothing. */
export default function StudentTourPage() {
  const { tourId } = useParams<{ tourId?: string }>()
  if (tourId && TOUR_ID.test(tourId)) return <StudentInvitationPage key={tourId.toLowerCase()} tourId={tourId.toLowerCase()} />
  return <div className="lp st st-x st--entry">
    <div className="st-x-bg" aria-hidden="true"><i /><i /><i /></div>
    <StudentHeader session={null} />
    <main className="st-main">
      <h1>Không tìm thấy buổi tham quan</h1>
      <p>Hãy mở đường link trong email lời mời và nhập mã truy cập của bạn.</p>
    </main>
  </div>
}
