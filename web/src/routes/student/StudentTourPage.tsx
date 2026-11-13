import { usePageTitle } from '../../components/ui/use-page-title'
import { Link, useParams } from 'react-router'
import { StudentHeader } from '../../features/student/components/StudentHeader'
import { StudentInvitationPage } from '../../features/student/invitation/StudentInvitationPage'
import '../../features/student/student.css'
import '../../features/student/student-expedition.css'
import '../../features/student/invitation/invitation.css'

const TOUR_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A Tour opens only from the link in an invitation email; the URL itself grants nothing. */
export default function StudentTourPage() {
  usePageTitle('Vào buổi tham quan')
  const { tourId } = useParams<{ tourId?: string }>()
  if (tourId && TOUR_ID.test(tourId)) return <StudentInvitationPage key={tourId.toLowerCase()} tourId={tourId.toLowerCase()} />
  return <div className="lp st st-x st--entry">
    <a className="st-skip" href="#student-main">Đến nội dung chính</a>
    <StudentHeader session={null} />
    <main id="student-main" tabIndex={-1} className="st-main st-entry-message st-ctn">
      <h1>Mở link trong email lời mời để vào buổi tham quan</h1>
      <p>Không thấy email? Hỏi thầy cô hoặc đại diện trường để gửi lại.</p>
      <p><Link className="st-entry-home" to="/">Về trang chủ</Link></p>
    </main>
  </div>
}
