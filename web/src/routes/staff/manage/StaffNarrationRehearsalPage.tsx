import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useQueries } from '@tanstack/react-query'
import { technicalApi } from '../../../features/technical/api/technical'
import { ToneBadge } from '../../../features/technical/TechnicalUi'
import { ArrowLeft, Navigation, RotateCcw, SkipForward } from 'lucide-react'
import { PageHeader } from '../../../components/ui/ConsolePrimitives'
import { buttonClass } from '../../../components/ui/ui-classes'
import { AdminErrorPanel, AdminPage, Notice, SkeletonRows } from '../../../features/administration/AdminUi'
import { usePoiProposals } from '../../../features/technical/technical-hooks'
import { errorText } from '../../../features/technical/technical-format'
import { StudentLiveView } from '../../../features/student/components/StudentLiveView'
import { buildLiveSnapshot, type StudentTourStop } from '../../../features/student/invitation/student-tour-view'
import '../../../features/student/student.css'
import '../../../features/student/student-expedition.css'

/** Seconds the simulated robot spends travelling before it "arrives" at the next stop. */
const TRAVEL_SECONDS = 3

type Phase = { index: number; at: 'travelling' | 'stop' } | null

/**
 * Rehearses a Tour's narration without a robot: the real Student live view, fed a simulated position over the
 * Staff's own POIs, so the voice starts exactly as it would when the robot reports an arrival.
 */
export default function StaffNarrationRehearsalPage() {
  const proposals = usePoiProposals()
  const [picked, setPicked] = useState<string[] | null>(null)
  const [phase, setPhase] = useState<Phase>(null)

  // Narration text is not on the POI list any more (ADR-0060): read the versions of each POI that has some.
  const candidates = useMemo(() => (proposals.data ?? [])
    .filter(p => !p.discardedAt && (p.narration?.approved || p.narration?.draft)), [proposals.data])
  const versions = useQueries({ queries: candidates.map(p => ({
    queryKey: ['technical', 'poi-proposals', 'narrations', p.id], queryFn: () => technicalApi.listPoiNarrations(p.id),
  })) })
  const loadingText = versions.some(query => query.isPending)
  const textError = versions.find(query => query.isError)?.error
  // The approved version is what a Tour reads; a POI with only a draft rehearses that draft, labelled as such.
  const withNarration = candidates.flatMap((p, index) => {
    const list = versions[index]?.data ?? []
    const approved = list.find(item => item.state === 'APPROVED')
    const draft = list.find(item => item.state === 'DRAFT')
    const used = approved ?? draft
    return used ? [{ id: p.id, name: p.revision.name, description: p.revision.description, text: used.narrationText, isDraft: !approved }] : []
  })
  const chosen = picked ?? withNarration.map(p => p.id)
  const stops: StudentTourStop[] = chosen
    .map(id => withNarration.find(p => p.id === id))
    .filter(p => p !== undefined)
    .map((p, index) => ({
      order: index + 1, poiId: p.id, name: p.isDraft ? `${p.name} (Bản đang soạn)` : p.name, description: p.description ?? null,
      narrationText: p.text, audioUrl: null, narrationSeconds: null, dwellSeconds: 60,
    }))

  // Travelling ends with an arrival, like a robot's GoTo reporting ARRIVED.
  useEffect(() => {
    if (phase?.at !== 'travelling') return
    const timer = setTimeout(() => setPhase({ index: phase.index, at: 'stop' }), TRAVEL_SECONDS * 1000)
    return () => clearTimeout(timer)
  }, [phase])

  const current = phase ? stops[phase.index] : undefined
  const snapshot = buildLiveSnapshot(
    { tourId: 'rehearsal', tourName: 'Chạy thử thuyết minh', tourState: 'RUNNING', scheduledStartAt: new Date().toISOString(),
      invitationExpiresAt: '', rowType: 'INDIVIDUAL', fallbackVideoUrl: null },
    { stops, progress: phase && current ? {
      step: phase.at === 'stop' ? 'OBSERVING' : 'NAVIGATING',
      currentPoiId: current.poiId,
      lastArrivedPoiId: phase.index > 0 ? stops[phase.index - 1].poiId : null,
      needsAssistance: false, isHeld: false,
    } : null },
  )
  const next = phase ? phase.index + 1 : 0
  const finished = phase?.at === 'stop' && next >= stops.length

  const toggle = (id: string) => setPicked(chosen.includes(id) ? chosen.filter(x => x !== id) : [...chosen, id])

  return <AdminPage>
    <PageHeader eyebrow="Quản lý POI" title="Chạy thử thuyết minh" description="Giả lập robot đi qua các POI để nghe lời thuyết minh đúng như trang học sinh, không cần robot."
      action={<Link to="/staff/manage/pois" className={buttonClass('secondary', 'sm')}><ArrowLeft size={14} aria-hidden="true" />Quay lại</Link>} />

    {proposals.isPending ? <SkeletonRows /> : proposals.isError ? <AdminErrorPanel title="Không tải được danh sách POI" description={errorText(proposals.error)} onRetry={() => void proposals.refetch()} /> : <>
      <section className="mb-4 rounded-[15px] border border-[#e2e8f0] bg-white p-4">
        <h2 className="text-base font-bold text-[#2d3748]">Điểm dừng theo thứ tự</h2>
        {textError ? <Notice tone="danger">Không tải được nội dung thuyết minh. {errorText(textError)}</Notice>
          : loadingText ? <p className="mt-2 text-sm text-[#718096]">Đang tải thuyết minh…</p>
          : withNarration.length === 0
          ? <Notice tone="warn">Chưa có POI nào có nội dung thuyết minh.</Notice>
          : <ul className="mt-2 flex flex-wrap gap-2">{withNarration.map(p => {
              const order = chosen.indexOf(p.id)
              return <li key={p.id}><label className="inline-flex items-center gap-2 rounded-lg border border-[#e2e8f0] px-3 py-1.5 text-sm">
                <input type="checkbox" checked={order >= 0} disabled={phase !== null} onChange={() => toggle(p.id)} />
                {order >= 0 && <b>{order + 1}.</b>}{p.name}
                {p.isDraft && <ToneBadge tone="warn">Bản đang soạn</ToneBadge>}
              </label></li>
            })}</ul>}
        <p className="mt-2 text-xs text-[#718096]">Mỗi điểm đọc bản thuyết minh đã duyệt; điểm chỉ có bản đang soạn đọc bản đó và có nhãn “Bản đang soạn”. Bỏ chọn rồi chọn lại để đổi thứ tự. Bấm vào trang ít nhất một lần để trình duyệt cho phép phát tiếng.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className={buttonClass('primary', 'sm')} disabled={!stops.length || phase?.at === 'travelling' || finished}
            onClick={() => setPhase({ index: next, at: 'travelling' })}>
            {phase ? <SkipForward size={14} aria-hidden="true" /> : <Navigation size={14} aria-hidden="true" />}
            {phase ? 'Robot đi tới điểm tiếp theo' : 'Bắt đầu: robot đi tới điểm 1'}
          </button>
          {phase && <button type="button" className={buttonClass('secondary', 'sm')} onClick={() => setPhase(null)}>
            <RotateCcw size={14} aria-hidden="true" />Làm lại từ đầu</button>}
          <span className="self-center text-sm text-[#4a5568]" role="status">
            {!phase ? 'Chưa bắt đầu.' : phase.at === 'travelling' ? `Robot đang di chuyển tới điểm ${phase.index + 1}…`
              : `Robot đang ở điểm ${phase.index + 1}/${stops.length}${finished ? ', điểm cuối.' : '.'}`}
          </span>
        </div>
      </section>

      <div className="lp st st-x overflow-hidden rounded-[15px]">
        <StudentLiveView snapshot={snapshot} showMap={false} idleTitle="Chạy thử thuyết minh"
          video={{ emptyMessage: 'Chế độ chạy thử: không có hình trực tiếp.' }} />
      </div>
    </>}
  </AdminPage>
}
