/**
 * Every console menu entry and the page it opens: the page's heading must be the
 * menu label, and the small line above it the menu group (`nav-page-titles.test.ts`).
 *
 * `file` is the page under `src/routes/`. `heading` says where its name is written:
 * `PageHeader` (eyebrow + title) or a plain `<h1>` (no eyebrow). `pending` names the
 * workstream that owns the page file and still has to set the text listed here;
 * until it does, that pair is reported as a todo instead of failing.
 */
export type NavPagePair = {
  area: 'staff' | 'admin' | 'technical'
  path: string
  file: string
  heading: 'PageHeader' | 'h1'
  pending?: string
}

export const NAV_PAGE_PAIRS: NavPagePair[] = [
  { area: 'staff', path: '/staff', file: 'staff/OverviewPage.tsx', heading: 'PageHeader', pending: 'WS-C' },
  { area: 'staff', path: '/staff/live', file: 'staff/LiveOperationsPage.tsx', heading: 'PageHeader', pending: 'WS-A' },
  { area: 'staff', path: '/staff/robot', file: 'staff/RobotPage.tsx', heading: 'PageHeader', pending: 'WS-C' },
  { area: 'staff', path: '/staff/schedule', file: 'staff/SchedulePage.tsx', heading: 'h1', pending: 'WS-C' },
  { area: 'staff', path: '/staff/manage/registrations/pending', file: 'staff/manage/StaffManageRegistrationsPage.tsx', heading: 'PageHeader', pending: 'WS-C' },
  { area: 'staff', path: '/staff/manage/pois', file: 'staff/manage/StaffManagePoisPage.tsx', heading: 'h1' },
  { area: 'staff', path: '/staff/manage/routes', file: 'staff/manage/StaffManageRouteCatalogPage.tsx', heading: 'PageHeader' },
  { area: 'staff', path: '/staff/history', file: 'staff/TourHistoryPage.tsx', heading: 'PageHeader' },

  { area: 'admin', path: '/admin/accounts', file: 'admin/AdminAccountsPage.tsx', heading: 'PageHeader', pending: 'WS-H' },
  { area: 'admin', path: '/admin/roles', file: 'admin/RolesPage.tsx', heading: 'PageHeader' },
  { area: 'admin', path: '/admin/schedule-blocks', file: 'admin/AdminSchedulePage.tsx', heading: 'PageHeader', pending: 'WS-I' },
  { area: 'admin', path: '/admin/robot-credentials', file: 'admin/AdminRobotCredentialsPage.tsx', heading: 'PageHeader' },
  { area: 'admin', path: '/admin/infrastructure', file: 'admin/AdminInfrastructurePage.tsx', heading: 'PageHeader' },
  { area: 'admin', path: '/admin/audit-logs', file: 'admin/AdminAuditLogsPage.tsx', heading: 'PageHeader' },

  { area: 'technical', path: '/technical/dashboard', file: 'technical/TechnicalDashboardPage.tsx', heading: 'PageHeader', pending: 'WS-F' },
  { area: 'technical', path: '/technical/robots', file: 'technical/TechnicalRobotsPage.tsx', heading: 'PageHeader', pending: 'WS-F' },
  { area: 'technical', path: '/technical/maps', file: 'technical/TechnicalMapsPage.tsx', heading: 'PageHeader', pending: 'WS-F' },
  { area: 'technical', path: '/technical/poi-file-import', file: 'technical/TechnicalPoiFileImportPage.tsx', heading: 'PageHeader', pending: 'WS-F' },
  { area: 'technical', path: '/technical/poi-import', file: 'technical/TechnicalPoiImportPage.tsx', heading: 'PageHeader', pending: 'WS-F' },
  { area: 'technical', path: '/technical/confirmations', file: 'technical/TechnicalConfirmationsPage.tsx', heading: 'PageHeader', pending: 'WS-F' },
]
