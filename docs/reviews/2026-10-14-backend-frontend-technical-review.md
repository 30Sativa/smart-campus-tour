# Technical Lead Review: Backend và Frontend CampusTour DT-AMR

Ngày review: 14/10/2026. Điểm xuất phát: HEAD `1cc5b33` và working tree hiện có.
Đây là đánh giá source hiện tại và các bản sửa trong lượt này, không phải quyết
định thay thế requirements/ADR hay xác nhận hệ thống đã đạt toàn bộ V1.

Phạm vi: `backend/`, `web/` và tài liệu liên quan. Không sửa robot, firmware,
Fleet Emulator hoặc AI service. Không đổi schema, scaffolded EF entities, API
routes, response DTO hay business scope. Không commit/push.

Đã bảo toàn thay đổi ban đầu ở
`backend/src/SmartCampus.Api/appsettings.Development.json`. Trong lúc review có
thêm công việc deployment ở `backend/`, `backend/scripts/verify` và
`docs/architecture.md`; các thay đổi đó không do lượt review này thực hiện và
không nằm trong kết luận về thiết kế deployment dưới đây.

## 1. Đánh giá tổng quan

**Backend có nền kiến trúc phù hợp với quy mô và nghiệp vụ hiện tại.** Bốn
project tạo dependency boundary thật qua project references: Domain độc lập;
Application dùng Domain; Infrastructure triển khai các boundary của Application;
API là composition root. Application không đưa EF, ASP.NET, `IQueryable` hay
SignalR vào handler. Controller dispatch use case và giữ transport concerns.

Feature-first commands/queries, specific repositories, validators và policies
đã đủ cho các luồng đang có. Domain chủ yếu là generated POCO do Database First;
điều này không tự động là lỗi thiết kế. Không cần biến từng entity thành aggregate,
thêm domain events, generic repository hoặc một service cho mỗi handler.
Các invariant đang được giữ tập trung trong Registration policies và transaction
boundary có giá trị hơn việc tăng số layer.

**Frontend có ownership tương đối rõ, nhưng vòng đời session là điểm yếu đáng
chú ý trước sửa.** Routes, feature hooks/API, shared transport và neutral UI đã
tách được phần lớn trách nhiệm. TanStack Query giữ server state; Zustand giữ
auth/UI state. Signed-in areas có role guard và lazy boundaries. Rủi ro được
tái hiện nằm ở response bất đồng bộ và cache qua các lần đăng nhập, không nằm
ở việc thiếu frontend service/repository framework.

Đã đi sâu vào Auth/bootstrap/logout/HTTP client, account và POI management,
registration submission/review/email correction, invitation delivery/admission,
MediatR transaction pipeline, Student cookie entry và các test liên quan.
Staff mock/realtime hooks, Web Digital Twin transforms/telemetry, WHEP và legacy
Student flow được kiểm tra ownership/lifecycle; không tuyên bố đã review mọi
dòng trong toàn bộ mô phỏng, CSS hay chạy các tích hợp robot/media.

Business scope được đối chiếu với
`docs/requirements/campus-tour-scope.md`, UI flow, `docs/architecture.md` và
ADR-0005/0008/0009/0010/0011/0012/0013/0014/0015. Authentication, live
registration/review, invitations, Student entry và Admin email correction có
source/test thực tế. Production scheduling/readiness/dispatch, operations Hub
và fleet bridge còn là phần riêng. Staff fixtures hoặc schema có RowVersion
không phải bằng chứng các use case đó đã triển khai.

## 2. Những vấn đề thực sự và bằng chứng

P1: cần sửa sớm vì ảnh hưởng identity/session. P2: correctness, regression hoặc
maintainability đáng xử lý; không phải tình huống khẩn cấp. P3: cải thiện có thể
đợi. Các mức này là mức review kỹ thuật, không thay backlog P0/P1/P2 nghiệp vụ.

| ID | Mức | Vấn đề và tác động | Bằng chứng | Trạng thái |
|---|---|---|---|---|
| R1 | P1 | Refresh trả muộn có thể ghi lại auth sau logout hoặc ghi đè tài khoản vừa đăng nhập; bootstrap/logout cũ cũng có thể xóa phiên mới. | `web/src/api/client.ts:47`, `web/src/auth/AuthBootstrap.tsx`, `web/src/auth/use-logout.ts`; regression tests mô phỏng deferred responses. | Đã sửa |
| R2 | P2 | Catch bao cả refresh và retry làm request bị abort/offline sau refresh bị coi như mất auth; lỗi network khi refresh cũng xóa phiên mặc dù chưa có bằng chứng cookie bị từ chối. | `web/src/api/client.ts:124`; tests về aborted retry và uncertain refresh failure. | Đã sửa |
| R3 | P2 | QueryClient dùng suốt ứng dụng không được dọn khi logout/đổi phiên; cached roster và mutation variables còn trong memory. Các query key Accounts/POI cũng không có owner. | `web/src/app/providers/query-provider.tsx`, `web/src/features/administration/accounts/hooks.ts`, `web/src/features/administration/pois/hooks.ts`; test đổi account với cùng query key. | Đã sửa |
| R4 | P2 | Spread `RequestInit.headers` thành object làm mất Headers instance hoặc tuple headers hợp lệ; tên header khác hoa/thường có thể đụng default. | `web/src/api/client.ts:111`; test truyền `new Headers(...)`. | Đã sửa |
| R5 | P2 | Baseline Student workflow test không còn khớp UI hiện tại và thiếu browser API trong jsdom, khiến suite fail và có unhandled exception. | `web/src/features/student/student-workflow.test.tsx`; lỗi `scrollIntoView` tại `web/src/features/student/components/StudentAiAssistant.tsx:25`. | Đã sửa test |
| R6 | P2 | POI reload thất bại vẫn có `result.data` cũ, nên có thể reset dirty draft về cache và xóa trạng thái lỗi; sau save cũng có thể lấy lại snapshot cũ. | `web/src/routes/admin/AdminPoiFormPage.tsx:178` và `:252`; kiểm tra TanStack Query thực tế trả state error nhưng giữ cached data. | Chưa sửa |
| R7 | P2 | Các đường ghi/admission tải toàn bộ lịch sử BrowserSessions; support read tải toàn bộ requested/result audits rồi mới chọn latest. Chi phí tăng theo lịch sử trong critical section có Tour lock. | `backend/src/SmartCampus.Infrastructure/Persistence/Repositories/EfStudentAccessRepository.cs:14`, `backend/src/SmartCampus.Infrastructure/Persistence/Repositories/EfInvitationRepository.cs:10` và `:50`. | Chưa sửa; chưa đo latency |
| R8 | P2 | Registry audit báo hai dependency có advisory high; Node đang thấp hơn engine yêu cầu của jsdom. | `npm audit --json`, `npm explain`, `web/package-lock.json`; `brace-expansion@5.0.9`, `source-map-js@1.2.1`, Node `24.14.1`/jsdom `30.0.1`. | Chưa đổi dependency/runtime |
| R9 | P2/P3 | Documentation có những câu implementation status đã cũ và policy phụ thuộc compiler default. | `web/AGENTS.md` từng nói strict chưa bật; router comment chỉ nói group-code; intro của `docs/architecture.md` vẫn gọi invitation là chưa triển khai trong khi §3.2.3/3.2.4 và source đã có. | Đã sửa web guide/config/router; còn drift trong tài liệu khác |

R1 được tái hiện bằng cách bắt đầu refresh, thực hiện logout hoặc login mới, rồi
mới trả response cũ. Bản sửa dùng session revision trong memory: explicit login,
logout hoặc cookie đổi identity tạo revision mới; refresh cùng account giữ
revision. Response cũ bị loại và request cũ không được retry bằng token tài
khoản khác. Single-flight chỉ chia sẻ trong cùng revision; finalizer cũ không
xóa refresh đang chạy cho revision mới.

R3 không phải bằng chứng backend authorization bị vượt qua. Representative,
review và invitation keys đã có owner, nên không nên tuyên bố mọi màn hình đều
lộ dữ liệu giữa tài khoản. Vấn đề thực tế là giữ dữ liệu private sau phiên và
một số key dùng chung; bản sửa dọn cả query/mutation cache tại session boundary.

R6 cần sửa trước khi mở rộng POI workflow: chỉ thay draft/token khi refetch
thành công; giữ draft và thông báo rõ khi thất bại. Test phải cover failed
explicit reload và save thành công nhưng reload thất bại. Sau save đã commit,
không được hướng người dùng tạo lại POI hoặc hiểu rằng save thất bại. Giải pháp
nhỏ là guard `result.isSuccess`, giữ riêng kết quả save/reload; không cần một
form framework mới. Chưa thay UI này trong lượt sửa hiện tại.

R7 là nguy cơ tăng chi phí có bằng chứng từ query, chưa phải một benchmark
chứng minh chậm. Nên tải open sessions cho đường revoke/reissue, lấy latest
delivery status bằng projection, rồi đo với history lớn. Retention vẫn cần
policy theo ADR-0011; không tự xóa lịch sử hay thêm schema trong review.

R8: `brace-expansion` đi qua ESLint/minimatch; `source-map-js` đi qua
Tailwind/PostCSS và jsdom. Đây là các đường tooling/build/test đã quan sát,
không chứng minh một exploit trong browser app. Advisory do registry trả về:
`GHSA-qhr7-859c-m2p7`, `GHSA-6j4f-fj2g-mc7p`,
`GHSA-q2hr-2g5m-vwhr` và `GHSA-68fv-2mgg-jv7q`.
Không chạy một lệnh audit fix nâng đồng loạt package trong lượt review kiến trúc.

## 3. Những thiết kế tốt nên giữ

- Các repo cụ thể che EF query construction; `IApplicationDbContext` chỉ là
  commit boundary. Việc resolve persistence có điều kiện trong pipeline phục
  vụ queries không cần context, không phải lý do thay toàn bộ DI design.
- Validation nằm ngoài transaction; UnitOfWork save ở trong transaction;
  successful response chỉ ra ngoài sau commit. POI dùng serializable usage
  check và row lock; registration writers dùng cùng Tour-first lock order.
- Shared registration invariants ở `backend/src/SmartCampus.Application/Features/Registrations/`, actor policies
  ở feature owner. Review và draft replacement dùng lại đúng boundary thay
  vì duplicate transaction/email reservation logic.
- Email claim commit trước external HTTP; result recording có scope riêng;
  UNKNOWN không tự retry. Resend attempt UUID, durable receipts và sanitized
  audit được thiết kế theo failure thực tế, không giả định SQL/HTTP atomic.
- Invitation hashes, protected code, version binding, browser-cookie hash và
  recheck sau lock đã có implementation. Support API không trả code hoặc
  session credentials. RowVersion và filtered unique index có test SQL.
- Auth access token giữ memory; role guard dùng chung access matrix; backend
  vẫn là nơi thực thi quyền. Student cookie access tách account refresh qua
  `auth: false` và không fallback sang mock khi API lỗi.
- Live registration/review và mock Tour administration được phân biệt. Không
  xóa `staffApi`/các contract chưa wire chỉ vì hiện tại hooks chọn fixtures:
  đây là extension boundary có chủ đích, không mặc định là dead code.
- Map/frame, đơn vị và calibration thuộc một transform boundary. Telemetry
  xử lý unknown/stale/order thay vì tạo pose/battery giả cho UI. Việc chưa vẽ
  physical pose khi chưa calibration là lựa chọn đúng.

## 4. Các cải thiện đã thực hiện

1. Sửa auth lifecycle ở HTTP client, auth store, bootstrap và logout; thêm test
   response đảo thứ tự, logout/login mới, cookie đổi account và aborted retry.
2. QueryProvider sở hữu QueryClient theo mount và dọn cache đồng bộ khi phiên
   đổi; test cover private cached data, inactive queries/mutation variables và
   giữ cache qua same-account refresh.
3. Chuẩn hóa header qua browser `Headers` API. Sửa HTTP mocks trong các test
   để đọc header theo chuẩn, vẫn assert Bearer, Content-Type, Idempotency-Key
   và việc Student không gửi account token.
4. Khôi phục baseline Student tests: assert đúng heading hiện tại, giữ kiểm tra
   roster match/session, live status, video/narration và tương tác tab Map/AI;
   mock/restore `scrollIntoView` chỉ trong test. Đổi tên suite thành legacy
   fixture workflow để không nhầm nó với personal-code entry đã có test riêng.
5. Khai báo `strict: true` tường minh. TypeScript `6.0.3` đang có effective
   strict checks mặc định, được kiểm tra bằng Compiler API; đây không phải
   migration bật strict trên một codebase chưa đáp ứng. Sửa `web/AGENTS.md`.
6. Thêm XML docs tại invitation/email, Student persistence, registration marker,
   commit boundary, transaction scope và behavior. Nêu thứ tự locks/save/commit,
   rollback, sensitive payload và ý nghĩa uncertain external delivery.
7. Thêm 10 test production DI/pipeline tại
   `backend/tests/SmartCampus.IntegrationTests/MutationPipelineTests.cs`:
   validation không mở transaction; handler/save/commit failure không trả
   success; dispose luôn diễn ra; success save trước commit cho hai marker.
   Dùng project đã có concrete DI dependency, không thêm package cho UnitTests.
8. Sửa router comment để phân biệt SQL GUID personal-code flow với fixture
   group-code flow. Báo cáo này lưu bằng chứng và việc chưa xử lý.

Không xóa test, hạ rule lint, nới timeout hoặc bỏ check để làm xanh suite.
Assertions thay đổi do Headers representation và UI đã thay đổi được thay
bằng assertions cùng contract/hành vi, không chỉ kiểm tra render thành công.

## 5. Quyết định và trade-off

**Dọn toàn bộ client cache tại session boundary.** Cách này đơn giản và dễ
kiểm chứng hơn gắn private metadata/prefix vào từng feature. Public/Student
queries cũng có thể refetch khi account session đổi; Student cookie không bị
thu hồi bởi việc clear cache. Same-account token refresh không gây clear.
Nếu sau này public cache rất lớn, có thể thu hẹp dựa trên measured cost.

**Request failure khác session rejection.** Chỉ refresh 401/403 của revision
hiện tại xóa local auth; network/5xx hoặc request bị cancel không tự logout.
Caller vẫn nhận lỗi, không được fabricated data. Session revision là client
guard trong một JavaScript runtime, không phải server authorization hoặc giải
pháp hoàn chỉnh cho HTTP cookie races giữa nhiều browser tabs.

**Giữ feature repositories và MediatR handlers.** Chưa có lợi ích rõ để thêm
repository/service/interface cho từng component/function. SQL mapping,
transport và policies vẫn ở đúng owner. Cũng không có lý do đổi công nghệ,
tách deploy unit, dùng CQRS infrastructure phức tạp hoặc distributed transaction.

**Không chia file theo số dòng.** `AdminPoiFormPage` đang cùng giữ draft mapping,
validation, reload/save/availability, map input và wizard. R6 cho thấy có một
trách nhiệm snapshot/draft đáng tách nếu form tiếp tục lớn. Chỉ nên trích pure
draft conversion/validation hoặc mutation-state logic có test, không cắt markup
thành hàng chục component. `backend/src/SmartCampus.Application/Common/Abstractions/Invitations/IInvitationCodeService.cs` chứa vài type cùng
capability; nhỏ và coherent, chưa đáng split chỉ vì có nhiều declaration.

**Các dependency nhỏ chưa phải lỗi architecture nghiêm trọng.**
`EfRegistrationRepository` tham chiếu `CorrectRosterEmailCommandHandler.AuditAction`:
hằng audit contract nên về shared `RegistrationAudit` khi sửa feature đó, để
repo không phụ thuộc tên orchestrator. `RepBell` dùng `web/src/features/staff/use-now.ts` và Twin
dùng freshness policy Staff: cần phân biệt neutral clock helper với operational
policy; không tự chuyển toàn bộ sang global utils. Đây là P3, không có lý do
refactor rộng ngay.

## 6. Documentation, comments và maintainability

Documentation tốt nhất hiện tại nằm ở transaction/registration boundaries,
map transforms và invitation ADR/setup. Các đoạn này giải thích vì sao lock,
version, UNKNOWN hoặc calibration tồn tại; nên giữ. XML docs ở AccountRoles và
Registration policies cũng mô tả trách nhiệm tốt. Điểm cần cải thiện là public
cross-feature contracts còn không đều và vài status summaries đã cũ.

Convention đề xuất:

- XML docs/TSDoc cho boundary quan trọng: trách nhiệm, inputs/result, units,
  ownership, side effects và điều kiện caller phải bảo đảm. Không comment mọi
  private helper hoặc generated entity.
- Comment tại invariant: lock order, snapshot version, retry/idempotency,
  expiry, security và uncertain delivery. Liên kết ADR khi cần lịch sử quyết định.
- Workaround ghi điều kiện tồn tại và khi nào có thể bỏ; không thay reasoning
  bằng một TODO không owner/điều kiện. Không thêm comment diễn giải từng dòng.
- Local source docs mô tả implementation; requirements mô tả target với status.
  ADR ghi quyết định; cập nhật tiến độ implementation ở canonical section thay
  vì coi mọi câu lịch sử trong ADR là hiện trạng.

Các statement cũ còn ở intro `docs/architecture.md`, status index ADR-0010 và
phần parser/approved-email của vài local guides cần rà lại theo §3.2.1–3.2.4 và
tests hiện tại. Không coi chúng là lý do gỡ feature đang có hoặc sửa business
scope. `docs/architecture.md` đang có thay đổi deployment đồng thời, nên lượt
này không ghi đè toàn bộ tệp để đồng bộ prose.

## 7. Verification và giới hạn bằng chứng

Baseline đầu tiên:

- Backend restore/build warn-as-error qua; 83 unit tests và 53 non-SQL
  integration tests pass; 79 SQL tests skip khi chưa có test connection.
- Sau khi xác nhận quyền tạo disposable database trên SQL Server local, chạy
  lại được 83 + 132 tests, không skip. Dispatcher lỗi trùng thời điểm script
  verify có thay đổi từ công việc khác; không dùng lượt đó làm kết luận exit 0.
- Web baseline qua map parity/typecheck/lint, nhưng 2 workflow tests fail và
  1 unhandled jsdom exception. Nguyên nhân là stale assertions và browser API
  thiếu trong môi trường test, không phải dependency boundary của app.
- Regression tests mới đã được chạy trước sửa để tái hiện lỗi auth/cache/header.

Lượt cuối: **`scripts/verify backend web` → PASS, exit 0**, với
`SMARTCAMPUS_SCHEMA_TEST_CONNECTION` trỏ tới instance kiểm thử local.

| Check | Kết quả |
|---|---|
| Backend restore/build warn-as-error | PASS; 0 warnings, 0 errors |
| Backend unit tests | 83 pass, 0 fail, 0 skip |
| Backend integration tests, gồm SQL thật | 144 pass, 0 fail, 0 skip |
| Web npm ci / map parity | PASS; map2-v2 parity |
| Web typecheck / ESLint | PASS |
| Web Vitest | 63 files, 422 tests pass; 0 fail |
| Web production build | PASS |
| Final diff whitespace check | `git diff --check` → exit 0 |

144 integration tests bao gồm 10 pipeline tests của lượt này và 2 deployment
tests xuất hiện từ công việc đồng thời; không quy toàn bộ test tăng thêm cho
review. Các SQL tests tạo/drop database riêng, không chạy schema snapshot lên
database sản phẩm. Email provider được fake, không gửi email thật.

`npm audit --json` là check bổ sung, vẫn exit 1 với hai advisory high ở R8;
không được gọi là audit PASS. `npm ci` có engine warning: jsdom yêu cầu
`^22.22.2 || ^24.15.0 || >=26.0.0`, host hiện `24.14.1`. Warning này không làm
verify tự động fail. Vite cảnh báo một số chunk lớn hơn 500 kB, chưa đo impact
trên journey thiết bị thật; không tăng warning limit để giấu thông báo.
jsdom cũng báo Canvas chưa triển khai ở legacy Confetti;
không dùng suite này để khẳng định Canvas/WebGL hiển thị đúng.

Chưa kiểm chứng: cookie acceptance với HTTPS FE/BE thật và third-party-cookie
policies, concurrent tabs/cookie-response order, Resend inbox delivery, browser
WebRTC/media, production fleet/operations Hub, AI/STT/TTS, throughput dưới tải
viewer lớn hoặc robot/hardware. Không thay markup/styles màn sản phẩm trong
lượt này; việc sửa workflow tests không phải một visual acceptance mới.
Không chạy verify deploy units ngoài phạm vi BE/FE.

## 8. Technical debt và thứ tự xử lý

**Cần xử lý sớm:**

1. R6: failed POI reload/save-refetch giữ draft/token và thông báo đúng commit
   outcome; thêm regression tests và browser check cho workflow này.
2. R8: triage/adapt lockfile có chủ đích cho hai transitive advisories; chạy
   lại audit và verify. Chuẩn hóa Node version tương thích với lockfile engines.
3. Chạy browser HTTPS cookie scenarios trong
   `backend/docs/invitations-resend.md`, bổ sung account-switch/logout/tab races.
4. Duy trì một lane CI có SQL disposable để tránh PASS thường xuyên đi cùng
   skip 79 tests. Giữ lane nhẹ cho môi trường không SQL và ghi rõ cả hai kết quả.
5. R7: thu hẹp reads trong Tour critical section, đo dữ liệu lịch sử lớn; quyết
   định retention theo ADR-0011 trước dữ liệu thật, không tự chọn thời hạn.

**Có thể làm sau hoặc cùng feature kế tiếp:**

- R9: đồng bộ implementation status; làm doc delta nhỏ khi feature thay đổi.
- POI form responsibility extraction sau khi khóa đúng snapshot behavior.
- Chuyển audit action constant khỏi handler và neutral clock helper về owner
  phù hợp khi chạm các capability đó; không thêm global helpers bucket.
- Legacy Student voice handler có recognition instance/timer không được giữ
  và cleanup khi unmount (`web/src/features/student/components/StudentAiAssistant.tsx:73`, `:81`, `:105`). WHEP hook
  cũng nên có test disconnect trước setup hoàn tất: callback tại
  `web/src/features/quest-stream/use-whep-stream.ts:131` tham chiếu `s` trong
  lúc `await startWhep` chưa gán xong. Đây là lifecycle risk từ source, chưa
  được tái hiện với media/browser thật trong lượt này.

Production dispatch/Start/Next/branch/recovery là implementation backlog đã
ghi nhận, không gọi mọi chỗ còn mock là architecture defect. Harness SignalR
có S1 pass nhưng S2/S2B bị block; README của
`backend/tests/SignalRCompatibilityHarness/` vẫn nêu reconnect/startup gate
chưa đạt. Không dùng kết quả build/test BE/FE để bỏ ADR-0008 gate.

## 9. Đề xuất cho team phát triển dài hạn

Giữ mỗi feature thay đổi cùng API contract, actor policy, concurrency invariant,
negative tests và implementation-status delta. PR review nên kiểm tra failure
và retry trước khi bàn về style: stale response, stale RowVersion, rollback,
double submission, forbidden owner và external UNKNOWN. Không dùng phần trăm
coverage hoặc số class/interface làm thước đo chính.

Thêm automatic boundary checks chỉ khi chúng bảo vệ vi phạm thật: project
references đã bảo vệ backend layer; FE có thể bổ sung import restriction cho
`registrations` không phụ thuộc Administration/Representative và shared UI không
phụ thuộc feature. Bắt đầu bằng các ownership boundary đã có, không dựng một
plugin architecture hay architecture-testing framework mới.

Đo latency/lock duration và bundle/runtime cost khi tích hợp thật. Render/media
tests, SQL concurrency tests và fixture tests giải quyết các rủi ro khác nhau;
ghi rõ nguồn bằng chứng khi báo DONE. Một app/một deploy, feature-first,
repositories cụ thể và neutral UI dùng chung vẫn là hướng phù hợp cho team này.
