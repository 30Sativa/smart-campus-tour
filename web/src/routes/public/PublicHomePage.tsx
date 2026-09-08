import { Link } from 'react-router'
import { MotionTest } from '../../components/ui/MotionTest'

export default function PublicHomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-slate-950 text-white">
      <MotionTest />
      <h1 className="text-4xl font-bold">CampusTour DT-AMR</h1>
      <p className="text-slate-400">Visitor booking — chưa implement.</p>
      <Link to="/admin" className="text-sm text-sky-400 underline">
        Operations dashboard
      </Link>
    </main>
  )
}
