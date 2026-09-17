# Kế hoạch làm sạch cấu trúc frontend

> **Trạng thái 2026-09-17 — tách ba khu vực.** FE hiện có **ba** lối vào:
> landing `/`, vận hành `/staff/*` (CampusStaff, TourOperator, Admin) và quản trị
> `/admin/*` (chỉ Admin). Dashboard vận hành trước đây nằm ở `/admin/*`; đó là
> tên gọi tạm của giai đoạn chỉ có một khu vực đăng nhập, nay đã đổi. Các URL
> vận hành cũ (`/admin/schedule`, `/admin/amr`, `/admin/alerts`,
> `/admin/digital-twin`, `/admin/reports`, `/admin/tours/:id`) redirect sang
> `/staff/*`; riêng `/admin` **không** redirect vì đó là trang tổng quan quản
> trị. Các redirect này là giàn giáo di trú, xoá khi không còn link cũ.
>
> Quy tắc ai vào được khu vực nào nằm đúng một chỗ: `src/auth/access.ts`. Route
> guard và màn "Vai trò & quyền" gọi chung một hàm nên không thể lệch nhau.
>
> Namespace route của FE và namespace API của BE độc lập với nhau: màn ở
> `/staff/*` vẫn gọi `/api/staff/*`, không đổi contract.
>
> Quản trị hiện chỉ có hai mục — Tổng quan hệ thống và Vai trò & quyền — vì đó
> là tất cả những gì contract hiện tại dựng được một cách trung thực. Người
> dùng, nhân viên, thiết bị, tour/tuyến/POI, cấu hình và nhật ký còn chờ
> endpoint; chúng được liệt kê một lần trong panel "Chưa khả dụng" trên trang
> tổng quan, không đưa vào điều hướng để tránh menu dẫn tới trang rỗng.
>
> **Trạng thái 2026-09-16.** Đợt cắt gọn đầu tiên đã chạy. Đã xử lý P0 #1 (một
> cây route + redirect), #2 (bỏ `persist`, token chỉ trong memory), #3 (lazy cả
> shell lẫn page), #4 (một cách hiểu role duy nhất), #5 (gỡ E-Stop khỏi
> browser), #7 (một `useLogout` dùng chung), #8 (refresh single-flight reject
> mọi request đang chờ); P1 #1, #2, #4, #6, #7 và phần lớn P2. Backend đã bị gỡ
> nên mọi endpoint được thay bằng lớp mock có nhãn trong `src/mocks/` (xem
> `web/AGENTS.md` §2). Còn lại: P1 lifecycle/CSS của landing (mục 3 bên dưới) và
> Phase 5 realtime/Digital Twin.
>
> File bị loại nằm ở `_to_delete/web-fe-cleanup-2026-09-16/`, chưa xoá hẳn.

## 1. Mục tiêu và phạm vi

Kế hoạch này dựa trên `web/AGENTS.md` mới ở nhánh `main`. Phạm vi là tổ chức lại
frontend hiện có, không giữ các quyết định tạm của backend vừa bị gỡ, đồng thời
không thay đổi sản phẩm theo cảm tính.

Mục tiêu cuối:

- một React + Vite app duy nhất;
- visitor ở các public route, staff/ops ở `/staff/*`, quản trị ở `/admin/*`;
- route chỉ ghép layout và page, nghiệp vụ nằm trong feature;
- server state dùng TanStack Query, UI state dùng Zustand khi thật sự cần;
- HTTP đi qua một client chung, SignalR có một owner rõ ràng;
- access token chỉ nằm trong memory, refresh token chỉ do cookie HttpOnly quản lý;
- không có lệnh E-Stop từ browser;
- `web/scripts/verify` và visual QA đều pass.

FE chưa được refactor trong thay đổi hiện tại. Chỉ có các sửa cơ học để baseline
verification chạy được: xoá unused import, đổi phép tính chart sang dạng bất
biến, tách formatter khỏi file component và đồng bộ test với register toggle
hiện hữu. Tài liệu này là kế hoạch thực thi.

## 2. Audit hiện trạng

### P0: sai boundary và an toàn

1. Router đang tách hai dashboard `/admin/*` và `/staff/*`, trong khi harness quy
   định một cây `/admin/*` được bảo vệ bằng role.
   (Ghi chú 2026-09-17: vấn đề khi đó là hai cây **trùng nội dung**. Việc tách
   `/staff/*` và `/admin/*` hiện nay là tách theo **vai trò và mục đích**, không
   phải nhân bản cây route.)
2. `src/stores/auth-store.ts` dùng Zustand `persist`, làm access token được lưu
   vào browser storage. Điều này trái contract token-in-memory.
3. `src/app/router/index.tsx` lazy-load page nhưng import eager `AdminSidebar`,
   `AdminTopbar` và `StaffShell`. Visitor vẫn nhận một phần code dashboard.
4. Role được normalize thành `TourOperator`, `CampusStaff`, `Admin`, nhưng
   `PublicHomePage.tsx` tự kiểm tra `ops/admin/staff`. Hai cách hiểu role không
   đồng nhất và có thể điều hướng staff như visitor.
5. `src/routes/staff/StaffSessionDetailPage.tsx` cung cấp browser E-Stop. Harness
   mới xác định cloud/web cancel không phải Emergency Stop và E-Stop phải ở
   robot-side.
6. Các API auth/booking/route/staff hiện trỏ vào backend test vừa bị gỡ. Chúng
   không được coi là contract thật cho lần triển khai tiếp theo.
7. Logout có ba implementation. Hai shell gọi endpoint mà không gửi
   `credentials: 'include'`; landing page chỉ xoá local state và không revoke
   refresh token.
8. Refresh queue trong `src/api/client.ts` không reject request đang chờ khi
   refresh thất bại, nên promise có thể treo vô hạn.

### P1: sai cấu trúc feature

1. `src/api/staff-hooks.ts` chứa query hooks, mutation orchestration và demo
   switching. Đây là logic của feature operations, không phải transport chung.
2. `src/api/staff-demo.ts` trộn fixture, phép tính thời gian và Zustand store vào
   API layer.
3. Query hooks của booking/tour nằm trực tiếp trong route hoặc shared component,
   ví dụ `BookingFlow.tsx`, `ToursPage.tsx`, `LiveTour.tsx` và `BookingWidget.tsx`.
4. `src/components/ui/` chứa component chỉ phục vụ một feature. `BookingWidget`
   là booking feature; admin sidebar/topbar là operations shell, không phải UI
   dùng chung.
5. Có hai hệ ops song song: `routes/admin` + `features/admin-dashboard` và
   `routes/staff` + `components/staff`.
6. Auth bị lặp: `LoginPage.tsx` đã chứa register flow nhưng vẫn có
   `RegisterPage.tsx` riêng.
7. `UserDashboardPage.tsx` không được đăng ký trong router nhưng kéo theo một
   nhóm component và mock data riêng. Các file này cần reachability audit trước
   khi giữ hoặc xoá.

### P1: maintainability và lifecycle

1. `PublicHomePage.tsx` dài khoảng 847 dòng, điều khiển DOM bằng id/querySelector,
   tự gắn nhiều event listener và timer. Phần lớn listener anonymous không có
   cleanup tương ứng.
2. `index.css` khoảng 382 dòng và `landing.css` khoảng 285 dòng. Landing CSS đặt
   selector global cho `body`, `p`, `img`, `a` và reset toàn app, nên style có
   thể rò sang auth, visitor app và dashboard.
3. `landing.css` khai báo token tự tham chiếu như `--accent: var(--accent)`, làm
   ownership của design token không rõ ràng.
4. Nhiều page/component lớn đang trộn presentation, query, mapping trạng thái và
   mutation trong cùng file. Việc tách chỉ nên theo responsibility, không theo
   quota dòng tùy ý.
5. `AmrStatus.batteryPercent` đang bắt buộc và UI gọi `toFixed`, trong khi
   contract mới coi battery là nullable/optional.
6. Demo data có thể bật ngay trong shell production. Mock/fixture phải là chế độ
   development hoặc test có nhãn rõ ràng, không được làm fallback khi API lỗi.

### P2: artifact và dependency debt

1. `web/__gen.cjs`, `web/public/gen.cjs`, `gen_body.txt`, `gen_css.txt`,
   `gen_js.txt`, `campus-tour-landing.html`, `hero-preview.html` và
   `hero-v2.html` là artifact/prototype. Generator còn chứa absolute path từ máy
   cá nhân.
2. `FeatureCards`, `MainNavbar`, `Navbar` và `RobotIllustration` hiện không có
   consumer trong app. Chỉ xoá sau khi import graph và visual baseline xác nhận.
3. `axios` có trong dependency nhưng source đang dùng `fetch` qua `apiClient`.
4. `@studio-freight/lenis` đã bị npm đánh dấu deprecated và đổi tên package.
   Không nâng package trong cleanup đầu tiên; trước hết quyết định landing có
   thật sự cần smooth-scroll hay không.

### Baseline verification

Ngày 2026-09-17, `web/scripts/verify` fail ở bước typecheck:

```text
src/routes/staff/StaffDashboardPage.tsx(4,1): error TS6192:
All imports in import declaration are unused.
```

Đây là lỗi hiện có trước refactor. Sau các sửa cơ học không đổi behavior,
`web/scripts/verify` đã pass với 11 test files và 27 tests. Lint còn báo hai
warning React Hook Form trong auth pages; các warning này thuộc Phase 1. Mỗi
phase bên dưới phải kết thúc bằng verify pass; không dồn lỗi đến PR cuối.

## 3. Cấu trúc đích

```text
web/src/
├── app/
│   ├── providers/
│   └── router/                 route config và lazy boundaries
├── api/
│   ├── client.ts              HTTP, auth header, refresh single-flight
│   ├── signalr.ts             factory, không tự connect khi import
│   └── contracts/             endpoint DTO/client đã được BE chốt
├── auth/
│   ├── auth-store.ts          memory only
│   ├── AuthBootstrap.tsx      refresh cookie khi app khởi động
│   ├── RequireRole.tsx
│   └── login/register/logout
├── features/
│   ├── tours/                 components, query hooks, view models, tests
│   ├── bookings/
│   ├── visitor-profile/
│   ├── ai-guide/
│   ├── operations/            dashboard, schedule, alerts, fleet controls
│   └── digital-twin/          canvas, transform, realtime owner
├── routes/
│   ├── public/                page composition mỏng
│   └── admin/                 page composition mỏng, toàn bộ lazy-loaded
├── components/ui/             chỉ component có từ hai consumer thật
├── stores/                    UI state dùng chung thật sự
├── styles/                    token/base tối thiểu; không CSS global theo page
└── test/
```

Không tạo barrel, service, interface hoặc custom hook chỉ để làm cây thư mục
trông đẹp. Mỗi abstraction phải có boundary hoặc reuse thật.

## 4. Trình tự thực hiện

### Phase 0: chốt baseline và contract

- Đồng bộ `web/AGENTS.md` mới từ `main` vào nhánh làm việc bằng một merge/rebase
  riêng, không chép kèm code robot ngoài phạm vi.
- Sửa lỗi typecheck hiện tại mà không đổi behavior.
- Ghi characterization tests cho router/role, auth bootstrap, refresh failure và
  logout trước khi di chuyển file.
- Lập bảng endpoint FE đang giả định và đánh dấu `confirmed`, `pending`, hoặc
  `obsolete`. Không dựng lại BE chỉ để làm UI cũ chạy.
- Chốt role claim với BE trước khi bỏ legacy mapping.

Exit: verify pass và có test khóa các đường đi auth/route quan trọng.

### Phase 1: sửa boundary auth, router và safety

- Gộp staff/ops/admin vào `/admin/*` với một `RequireRole` duy nhất.
- Giữ redirect tạm từ `/staff/*` sang route `/admin/*` tương ứng để không làm
  hỏng bookmark trong giai đoạn chuyển đổi.
- Lazy-load cả admin layout/shell và mọi child route, không chỉ lazy page.
- Bỏ `persist` khỏi auth store. Khi reload, `AuthBootstrap` gọi refresh bằng
  HttpOnly cookie rồi mới quyết định route.
- Gom login/register/logout vào một auth boundary. Mọi logout gọi server với
  credentials, sau đó clear query cache và local memory theo policy đã chốt.
- Viết lại refresh single-flight để mọi request chờ đều resolve hoặc reject.
- Gỡ toàn bộ browser E-Stop. Chỉ giữ assign/reassign/cancel khi contract BE có,
  và mỗi action phải có confirmation rõ ràng.

> **Đã thay thế 2026-09-17.** Quyết định gộp ở trên đúng cho giai đoạn chỉ có
> một khu vực đăng nhập. Nay vận hành nằm ở `/staff/*`, quản trị ở `/admin/*`,
> mỗi bên một shell và một guard riêng. Đừng gộp lại.


Exit: không còn access token trong storage, không còn UI E-Stop, role guard có
test cho visitor/staff/ops/unauthenticated, và public entry không import admin
shell.

### Phase 2: gom code theo feature

- Chuyển booking widget, booking queries/mutations và booking view state vào
  `features/bookings`.
- Chuyển tour list/detail query hooks vào `features/tours`.
- Hợp nhất hai implementation ops thành `features/operations`; chọn một shell,
  một status mapping và một bộ route.
- Chuyển staff hooks ra khỏi `src/api`. `src/api` chỉ giữ transport/client và
  contract đã chốt.
- Đưa demo fixtures vào `features/operations/dev` hoặc test fixtures, chỉ được
  bật bằng development flag rõ ràng.
- Giữ route component mỏng: đọc params, ghép feature, chọn page-level state.
- Chỉ promote primitive lên `components/ui` sau consumer thứ hai.

Exit: không có feature hook/store trong `src/api`, không có query orchestration
trong shared UI, và không còn hai ops shells.

### Phase 3: làm sạch landing và styling

- Tách `PublicHomePage` thành các section do landing feature sở hữu. Giữ content
  và URL/anchor hiện có trừ khi có quyết định sản phẩm khác.
- Thay DOM lookup/event listener thủ công bằng React handlers, refs và motion
  leaf có cleanup. Mọi timer/subscription phải có owner.
- Chỉ giữ animation có mục đích; hỗ trợ reduced motion.
- Thu hẹp CSS landing vào scope của landing hoặc chuyển phần diễn đạt được sang
  Tailwind. `index.css` chỉ giữ Tailwind import, semantic tokens và base styles
  thực sự toàn app.
- Chuẩn hóa một token palette/radius system cho visitor surfaces; ops dashboard
  ưu tiên rõ ràng, mật độ vừa-cao và không dùng motion marketing.
- Kiểm tra loading, empty, error và offline/reconnecting state trên từng flow.

Exit: không có querySelector/getElementById cho interaction thông thường, không
có selector page-level rò ra toàn app, và visual QA pass ở mobile/desktop cùng
hai theme nếu vẫn hỗ trợ theme toggle.

### Phase 4: xóa dead code, prototype và dependency thừa

- Chạy import/reachability audit rồi xoá component, mock, page không thể đi tới.
- Xoá các generator/static prototype có absolute path sau khi lưu screenshot
  tham chiếu nếu team còn cần so sánh thiết kế.
- Xoá dependency không dùng. Chỉ thay Lenis nếu landing đã chứng minh vẫn cần
  smooth-scroll.
- Kiểm tra asset usage trước khi xoá ảnh/video lớn.

Exit: không có orphan module/artifact test trong production tree, dependency
graph khớp source, build output không chứa chunk thừa rõ ràng.

### Phase 5: realtime và Digital Twin sau khi contract được chốt

- Định nghĩa hub path, event name và DTO trong `docs/architecture.md` cùng BE.
- Một feature hook sở hữu lifecycle SignalR, reconnect và cleanup handler.
- Phân biệt Live, Stale, Disconnected; không bịa battery/pose khi thiếu dữ liệu.
- Đặt ROS-map -> Twin-world transform ở một module có test, không rải công thức
  coordinate trong component.
- Không đưa physics, Nav2, sensor stream hoặc E-Stop vào browser twin.

Exit: reconnect không nhân đôi handler, stale/out-of-order update có test, và
Digital Twin render đúng với battery nullable.

## 5. Cách chia PR đề xuất

1. `fe-baseline-auth-router`: baseline tests, token memory, refresh/logout,
   `/admin/*`, redirect `/staff/*`, bỏ E-Stop.
2. `fe-feature-boundaries`: tours, bookings, auth và operations về đúng owner.
3. `fe-landing-cleanup`: lifecycle, CSS scope, section composition, visual QA.
4. `fe-dead-code-assets`: prototype, orphan modules, dependency/asset cleanup.
5. `fe-realtime-twin`: chỉ bắt đầu sau khi BE/robot contract được ghi lại.

Không gộp cả năm phase vào một PR. PR nhỏ giúp phân biệt move-only với behavior
change và giữ review có thể kiểm chứng.

## 6. Definition of Done cho đợt cleanup

- `web/scripts/verify` exit 0.
- (2026-09-17: câu dưới mô tả trạng thái cũ. Hiện cả `/staff/*` và `/admin/*`
  đều có guard thực và lazy boundary riêng.)
- `/admin/*` có route guard thực và lazy boundary; `/staff/*` chỉ còn redirect
  tương thích trong thời gian đã định.
- Không có access token trong localStorage/sessionStorage.
- Không có direct `fetch` ngoài `src/api/client.ts`.
- Không có endpoint call hoặc query hook trong presentation component chung.
- Không có browser E-Stop hoặc ngôn ngữ khiến cancel bị hiểu là E-Stop.
- Demo data không tự động thay dữ liệu lỗi/thiếu từ API.
- Loading, empty, error, stale/reconnecting states có test ở nơi liên quan.
- Không còn prototype/generator máy cá nhân trong production tree.
- UI đã được render và kiểm tra trực quan trước khi báo hoàn tất.
