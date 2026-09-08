import { Link } from 'react-router'

export default function AdminDashboardPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-slate-900 text-white">
      <h1 className="text-3xl font-semibold">Operations dashboard</h1>
      <p className="text-slate-400">Chưa implement — route placeholder.</p>
      <Link to="/admin/digital-twin" className="text-sm text-sky-400 underline">
        Digital Twin (R3F smoke test)
      </Link>
    </main>
  )
}
