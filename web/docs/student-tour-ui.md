# Student Tour presentation

The Student route uses the same forest/lime tokens and Be Vietnam Pro type as
the Representative workspace. Its invitation, waiting, live and end screens
share the 1240px container, compact top bar, matching panel/control shapes and
light/dark theme. Design details: `web/src/features/student/design.md`.

The invitation entry combines a discovery introduction, the existing campus/robot
illustration and short robot/narration/AI feature labels beside the access-code
form. This introductory material is illustrative; Tour details remain protected
until a valid session. The form and its errors/retry keep the existing API flow.

Only presentation changes. `/tour/:tourId` still requires the existing personal
invitation code or per-Tour cookie session. A Student request never uses account
JWT refresh. The heartbeat still checks RUNNING access every 5 seconds. Shared
viewing notices, fallback video labels, retry controls and the private Q&A API
retain their contracts. The live map remains hidden without a real pose feed.

The full-width journey leads above the video and the tab panel, with labelled
current/completed/upcoming stops. The video and current stop are on the left;
narration, AI and route tabs share
one panel on the right. The AI stays mounted when its tab is hidden, preserving
the conversation and unsent question. On phones the panels stack, with route
labels in a compact horizontally scrolling strip above the video. Full stop
names and statuses remain accessible. Keyboard navigation and visible focus
are retained; the map still requires a real pose feed.
Button feedback and the sliding tab highlight respect reduced-motion settings.

Visual verification uses isolated HTTP fixtures outside the application source;
there is no runtime mock switch or fallback data in production. Verify real
camera/video availability in an authorized running Tour separately.
