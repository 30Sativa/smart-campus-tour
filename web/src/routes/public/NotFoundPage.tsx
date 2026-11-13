import { Link } from 'react-router'
import { AREAS, landingPathAfterLogin } from '../../auth/access'
import { usePageTitle } from '../../components/ui/use-page-title'
import { useAuthStore } from '../../stores/auth-store'

/**
 * Shown for an address that no route knows. A signed-in account also gets a
 * way back to its own area; the area pages keep their own "stay inside the
 * area" redirects.
 */
export default function NotFoundPage() {
  usePageTitle('Không tìm thấy trang')
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const role = useAuthStore((state) => state.user?.role)
  const areaPath = isAuthenticated ? landingPathAfterLogin(role) : '/'
  const area = areaPath === '/' ? null : AREAS.find((item) => item.path === areaPath)

  return (
    <main className="flex min-h-svh items-center justify-center bg-[#f5f7f8] px-4 py-12 text-slate-900 dark:bg-[#060d11] dark:text-slate-100">
      <div className="w-full max-w-md text-center">
        <img src="/images/logo.png" alt="" width={56} height={56} className="mx-auto size-14 object-contain dark:invert" />
        <p className="mt-6 text-sm font-semibold tracking-widest text-muted">LỖI 404</p>
        <h1 className="mt-2 text-3xl font-bold">Không tìm thấy trang</h1>
        <p className="mt-3 text-base text-muted">
          Đường dẫn này không có hoặc đã đổi. Hãy kiểm tra lại địa chỉ, hoặc chọn một trang bên dưới.
        </p>
        <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
          <Link
            to="/"
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-slate-900 px-6 font-semibold text-white hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200 dark:focus-visible:outline-white"
          >
            Về trang chủ
          </Link>
          {area && (
            <Link
              to={area.path}
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-slate-300 px-6 font-semibold hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 dark:border-slate-600 dark:hover:bg-slate-800 dark:focus-visible:outline-white"
            >
              Về khu vực {area.label}
            </Link>
          )}
        </div>
      </div>
    </main>
  )
}
