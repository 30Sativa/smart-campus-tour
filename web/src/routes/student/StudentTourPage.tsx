import { useLocation, useParams } from 'react-router'
import { StudentHeader } from '../../features/student/components/StudentHeader'
import { StudentJoinForm } from '../../features/student/components/StudentJoinForm'
import { StudentWaitingRoom } from '../../features/student/components/StudentWaitingRoom'
import { StudentLiveView } from '../../features/student/components/StudentLiveView'
import { StudentEndScreen } from '../../features/student/components/StudentEndScreen'
import { useStudentSnapshot, useStudentJoinMutation } from '../../features/student/student-hooks'
import { useStudentStore } from '../../features/student/student-store'
import '../../features/student/student.css'

export default function StudentTourPage() {
  const { tourId: paramTourId } = useParams<{ tourId?: string }>()
  const location = useLocation()
  const searchParams = new URLSearchParams(location.search)
  const queryGroupCode = searchParams.get('code') || ''

  const session = useStudentStore((s) => s.session)
  const clearSession = useStudentStore((s) => s.clearSession)

  // Nếu session có tourId thì ưu tiên dùng, nếu không thì dùng param trong URL hoặc mặc định
  const activeTourId = session?.tourId || paramTourId || 'tour-101'

  const { data: snapshot, isLoading: isSnapshotLoading } = useStudentSnapshot(activeTourId)
  const joinMutation = useStudentJoinMutation()

  const handleLeave = () => {
    clearSession()
  }

  // Nếu chưa có session học sinh hợp lệ: Hiển thị form tham gia
  if (!session) {
    return (
      <div className="st">
        <StudentHeader session={null} tourName={snapshot?.tourName} />
        <main className="st-main">
          <StudentJoinForm
            tourId={activeTourId}
            tourName={snapshot?.tourName}
            schoolName={snapshot?.schoolName}
            initialGroupCode={queryGroupCode || snapshot?.groupCode}
            isSubmitting={joinMutation.isPending}
            errorMessage={joinMutation.error ? (joinMutation.error as Error).message : null}
            onSubmit={(req) => joinMutation.mutate(req)}
          />
        </main>
      </div>
    )
  }

  if (isSnapshotLoading || !snapshot) {
    return (
      <div className="st">
        <StudentHeader session={session} />
        <div className="st-loading">
          <div>
            <span className="st-spinner" />
            <p>Đang đồng bộ dữ liệu buổi tham quan...</p>
          </div>
        </div>
      </div>
    )
  }

  // Tour đã kết thúc hoặc bị hủy
  const isTerminal =
    snapshot.tourState === 'Completed' ||
    snapshot.tourState === 'Cancelled' ||
    snapshot.step === 'ended_completed' ||
    snapshot.step === 'ended_cancelled'

  if (isTerminal) {
    return (
      <div className="st">
        <StudentHeader
          session={session}
          tourName={snapshot.tourName}
          onLeave={handleLeave}
        />
        <main className="st-main">
          <StudentEndScreen
            session={session}
            snapshot={snapshot}
            onLeave={handleLeave}
          />
        </main>
      </div>
    )
  }

  // Tour đang Scheduled hoặc Ready: Phòng chờ
  const isWaiting =
    snapshot.tourState === 'Scheduled' ||
    snapshot.tourState === 'Ready' ||
    snapshot.step === 'scheduled_waiting' ||
    snapshot.step === 'roster_updating'

  if (isWaiting) {
    return (
      <div className="st">
        <StudentHeader
          session={session}
          tourName={snapshot.tourName}
          isLive={false}
          onLeave={handleLeave}
        />
        <main className="st-main">
          <StudentWaitingRoom session={session} snapshot={snapshot} />
        </main>
      </div>
    )
  }

  // Tour đang Running: Vào Live Tour
  return (
    <div className="st">
      <StudentHeader
        session={session}
        tourName={snapshot.tourName}
        isLive={true}
        onLeave={handleLeave}
      />
      <main className="st-main">
        <StudentLiveView session={session} snapshot={snapshot} />
      </main>
    </div>
  )
}
