# V1 Admin Account Management — Implementation Plan

- Ngày lập: 01/10/2026.
- Trạng thái: **PROPOSED — chưa implement**. Các lựa chọn ở §3 chưa phải quyết định được chấp nhận.
- Phạm vi tích hợp: Backend + Web + public contract. Không redesign Authentication hoặc Initial Admin Seeder.
- Đây là kế hoạch/checklist tạm, không thay thế requirement, ADR hoặc runbook. Sau khi implementation hoàn tất, chỉ xóa khi contract lâu dài đã được ghi đúng nơi và không còn reference cần thiết.
- UI flow là tài liệu tham khảo theo chỉ dẫn của người dùng; được đề xuất chỉnh cho phù hợp, không dùng để áp đặt thiết kế hoặc mở rộng business scope.

## 1. Hiện trạng repo

Đã đối chiếu local working tree, không suy trạng thái từ GitHub main.

| Khu vực | Hiện trạng |
|---|---|
| Backend Auth | Có login/refresh/logout, Initial Admin Seeder, `IPasswordHasher`, `IUsernameNormalizer`. Login và refresh kiểm tra active và một supported role. |
| JWT authorization | Token validation kiểm tra chữ ký/issuer/audience/thời hạn; chưa kiểm tra `Users.IsActive` mỗi authenticated request. Chưa có account-management policy/endpoints. |
| Persistence | Command được UnitOfWork hiện hữu gọi `SaveChangesAsync` sau handler. Repository thông thường không tự commit. Có `AuditLogs`, chưa có account-management audit implementation. |
| Frontend Auth | `web/src/auth/LoginPage.tsx` vẫn gọi `mockLogin`; logout chỉ xóa state; registration còn mock. API client có refresh-on-401, nhưng frontend chưa nối đầy đủ real Auth. |
| Frontend Admin | `web/src/routes/admin/RolesPage.tsx` là reference chỉ đọc. Chưa có Accounts screen/API implementation. |
| Schema | Snapshot và generated EF local là v1.1. `Users`, `UserRoles`, `RefreshTokens`, `AuditLogs` đủ cho scope cơ bản; `Users` không có RowVersion. |
| Docs | ADR-0013 chốt single-role. Chưa có requirement hiện hành đủ rõ để đưa đổi role, reset password hoặc delete vào P0. |

Nguồn đối chiếu: `docs/architecture.md` §3.0; `docs/requirements/campus-tour-scope.md`; `docs/decisions/0013-single-application-role-per-account.md`; `backend/database/smart-campus-tour-schema-v1.1.sql`; Auth implementation và tests hiện tại.

Comment trong `web/src/auth/roles.ts` còn nhắc một account đồng thời giữ Staff là wording stale so với ADR-0013. Tài liệu Admin dashboard được đánh dấu historical không phải nguồn để tự thêm role-change/reset. Chưa sửa những file này trong task lập plan.

## 2. Requirement chắc chắn

- Admin cấp account Staff và School Representative, khóa/mở account.
- Account V1 có đúng một supported role: `ADMIN`, `STAFF`, `SCHOOL_REPRESENTATIVE`.
- Student không có account; không public self-registration.
- Account inactive không được login hoặc refresh.
- Reuse password hasher và username normalizer hiện có; không trả/log/audit password, hash hoặc token.
- Ghi audit append-only cho create/deactivate/reactivate; không sửa dữ liệu lịch sử để biểu diễn trạng thái mới.
- Không tự thêm role-change, password reset hoặc deletion chỉ vì schema hỗ trợ thao tác dữ liệu.

## 3. Open questions cần chốt

| ID | Câu hỏi | Đề xuất nhỏ nhất, chưa được duyệt |
|---|---|---|
| D1 | Có tạo/khóa/mở ADMIN qua UI/API V1 không? | Không. Chỉ quản lý Staff/Representative; danh sách có ADMIN nhưng chỉ đọc. Admin ban đầu vẫn do seeder cấp. |
| D2 | Khóa có chặn access token đang còn hạn không? | Có. Kiểm tra account hiện tại trong DB cho request dùng account JWT; revoke refresh tokens khi khóa. |
| D3 | JWT cũ có thể dùng lại khi account được mở trước lúc JWT hết hạn không? | Chấp nhận giới hạn này để giữ nguyên JWT contract. Refresh tokens đã revoke không được phục hồi. Nếu yêu cầu vô hiệu JWT cũ vĩnh viễn, cần thiết kế bổ sung trước implementation. |
| D4 | Cấp initial password thế nào? | Admin nhập, bàn giao ngoài hệ thống; chưa có bắt đổi lần đầu hoặc reset. Password này không tự hết hạn. |

Không diễn giải yêu cầu “lên plan” thành phê duyệt D1–D4. Có thể review các phần độc lập; chưa implement behavior phụ thuộc quyết định chưa chốt.

## 4. Scope V1 đề xuất

**MUST:** list có pagination, create Staff/Representative, deactivate/reactivate, Admin authorization, audit atomic, validation/conflict handling, UI cơ bản và tests. Real frontend Auth là dependency riêng để verify end-to-end.

**SHOULD:** search username/full name; filter role/trạng thái. Không để các tiện ích này chặn bốn use case chính.

**OUT:** tạo/quản lý ADMIN khi D1 chưa đổi; edit profile; đổi role; reset/forgot password; hard delete; multi-role; Student account; public register; permission editor; bulk import; email provisioning; MFA/SSO/OAuth; impersonation; analytics; Redis blacklist.

## 5. Backend design

### Application

- `Features/Accounts/Queries/ListAccounts`: query, validator, result.
- `Features/Accounts/Commands/CreateAccount`: command, validator, handler.
- `Features/Accounts/Commands/DeactivateAccount` và `ReactivateAccount`.
- Một `IAccountManagementRepository` có trách nhiệm truy xuất/stage dữ liệu của use case; không generic CRUD service.
- Reuse `IPasswordHasher`, `IUsernameNormalizer`, `TimeProvider`, exceptions, paging và command UnitOfWork hiện hữu.
- Actor lấy từ authenticated identity tại Api, không lấy từ body do client cung cấp.

### Infrastructure

- Query danh sách bằng projection; không lấy PasswordHash cho list.
- Create stage User + đúng một UserRole + AuditLog, cùng commit.
- Deactivate stage IsActive + revoke refresh tokens + AuditLog trong cùng transaction. Reactivate không sửa password/role hoặc phục hồi token revoked.
- Precheck username để báo lỗi sớm; DB unique constraint vẫn là guard cuối cùng. Map đúng lỗi unique username tại commit boundary sang conflict, vì handler trả về trước UnitOfWork SaveChanges.
- SQL/EF và transaction coordination nằm ở Infrastructure/commit boundary hiện hữu. Không sửa generated EF; không thêm UoW hoặc TransactionBehavior mới.
- Chốt cơ chế serialize session issuance/lifecycle ở phase backend trước khi cam kết revoke guarantee; xem §7. Không mở transaction cho mọi query hoặc mọi command không liên quan.

### Api

- Một `AdminAccountsController` dispatch MediatR; không business logic trong controller.
- Policy authenticated + role `Admin`.
- Account-status validation tại JWT authentication boundary, reuse auth persistence với projection tối thiểu.
- Account endpoints phải fail-closed khi chạy SimulationPreview; không dựa riêng vào frontend guard.

## 6. API contract đề xuất

Tất cả endpoint yêu cầu Admin. Public role names theo Auth hiện tại: `Admin`, `Staff`, `Representative`; mapping explicit sang role strings trong DB.

| Endpoint | Request | Success | Lỗi chính |
|---|---|---|---|
| `GET /api/admin/accounts` | `page=1`, `size=20`; search/filter nếu làm | 200 `PagedResponse<AccountSummary>` | 400 validation; 401 unauthenticated; 403 non-Admin |
| `POST /api/admin/accounts` | `username`, `fullName`, `role`, `initialPassword` | 201 `BaseResponse<AccountSummary>` | 400 invalid input/role; 409 normalized username trùng |
| `POST /api/admin/accounts/{id}/deactivate` | Không body | 200 `BaseResponse<AccountSummary>` | 404 không tồn tại; 403 target không được phép quản lý; 409 concurrent conflict nếu không serialize thành công |
| `POST /api/admin/accounts/{id}/reactivate` | Không body | 200 `BaseResponse<AccountSummary>` | Tương tự deactivate |

401/403 authorization áp dụng cho toàn bộ endpoint, không chỉ list.

`AccountSummary`: `id`, `username`, `fullName`, `role`, `isActive`, `createdAt`, `updatedAt`. Không trả NormalizedUsername, PasswordHash hoặc token data. Nếu role assignment trong DB bất hợp lệ, trả trạng thái role không hợp lệ rõ ràng (không giả chọn role đầu tiên), khóa actions; không sửa dữ liệu qua list.

- Create chỉ nhận scalar role `Staff` hoặc `Representative` theo D1; không nhận roles array, IsActive hoặc actor ID từ body. Mặc định active.
- Username dùng normalizer hiện có; giới hạn username/normalized username 100 và full name 150 ký tự. Không trim hoặc biến đổi password trước hashing.
- Validate password có giá trị sử dụng được, không tự thêm min-length/complexity subsystem hoặc khác biệt không cần thiết với Auth/Seeder.
- Validate page >= 1, size 1–100; sort cố định ổn định theo CreatedAt và Id. Không generic sort/expand engine.
- Gọi khóa một account đã inactive hoặc mở account đã active là no-op thành công: không đổi timestamp, không ghi audit lặp.
- Không thay response shape của Auth endpoints để khớp account endpoints.

## 7. Security/session semantics

### Behavior hiện tại và đề xuất

Access JWT sống 15 phút, validation có clock skew 30 giây; refresh token sống 7 ngày. Refresh đã check IsActive, JWT request validation chưa check DB. Chỉ đổi IsActive hiện chưa ngăn access token đang tồn tại.

Theo D2, request bằng account JWT phải kiểm tra user tồn tại, active, có đúng một supported role và khớp role claim. Có thể thực hiện ở `OnTokenValidated`: identity không còn hợp lệ -> 401; identity hợp lệ nhưng không đủ quyền Admin -> 403. Không áp dụng cơ chế account này thay cho Student invitation hoặc machine authentication.

Deactivate commit trạng thái inactive, revoke refresh tokens chưa revoked và audit cùng nhau. Refresh bằng token revoked -> 401 theo contract hiện hữu; trường hợp token chưa revoked nhưng account inactive vẫn bị chặn. Reactivate không xóa RevokedAt, không reset password/role.

Giới hạn phải ghi vào contract:

- Request đã qua status check trước thời điểm deactivate commit có thể tiếp tục; không hứa hủy in-flight request.
- Theo D3, JWT cũ chưa hết hạn có thể được chấp nhận sau reactivate. Không tuyên bố permanent JWT revocation và không dùng UpdatedAt làm security stamp.
- DB check thêm một truy vấn tối thiểu mỗi authenticated request. V1 không cache status để tránh làm chậm hiệu lực khóa.

### Concurrency có ý nghĩa

Login hiện có thể đọc active, sau đó deactivate revoke token cũ, rồi Login mới lưu thêm refresh token. Chỉ bulk revoke hoặc kiểm tra IsActive thêm ngoài transaction không loại bỏ race này.

Để bảo đảm session refresh trước lần khóa không sống lại sau mở, phase implementation phải phối hợp final active check + token insert của Login với deactivate trên cùng user, giữ transaction/row lock đến commit qua boundary hiện hữu. Test bằng hai request/connection thật với thứ tự điều khiển được. Đây là thay đổi persistence hẹp phục vụ khóa account, không redesign JWT/cookies/refresh rotation.

Lifecycle requests cạnh tranh phải serialize hoặc trả conflict rõ; không được tạo partial write hoặc audit cho chuyển trạng thái không thực sự xảy ra. Không dùng mock tests hay UpdatedAt như bằng chứng chống concurrency. Users chưa có RowVersion; không tự thêm schema chỉ để thuận tiện.

### Lockout và audit

Theo D1, backend cấm mutate mọi target ADMIN, nên self-deactivation và last-Admin lockout bị ngăn mà không cần count-based policy. Nếu đổi D1, phải thiết kế guard last-active-Admin có concurrency trước khi implement.

Chưa có account audit event implementation. Đề xuất tên theo kiểu uppercase underscore đã xuất hiện trong schema/tests: `ACCOUNT_CREATED`, `ACCOUNT_DEACTIVATED`, `ACCOUNT_REACTIVATED`. Ghi actor ID, target User ID, UTC time, result và thay đổi role/trạng thái cần thiết. Không ghi password/hash/token hoặc sao chép nguyên request vào DataJson. No-op không tạo success audit mới. Không thêm ROLE_CHANGED/PASSWORD_RESET khi không có feature.

## 8. Frontend UX

- Giữ `/admin/roles` chỉ đọc; thêm `/admin/accounts` và mục navigation tương ứng.
- Bảng username, full name, role, active/inactive, actions; pagination, loading/empty/error.
- Dialog create: username, full name, single-role Staff/Representative, initial password.
- Confirmation khóa/mở xác định rõ account bị tác động; disable submit trong lúc chờ; invalidate query sau thành công.
- Dùng shared UI, TanStack Query và API client hiện có; không tạo design system hoặc permission editor.
- Hiện field/conflict/403 errors phù hợp; backend vẫn là nơi enforce quyền.
- Password dùng input password, không lưu vào URL/localStorage/query data/analytics. Xóa form và mutation state chứa password sau khi đóng/hoàn tất; response không echo password.
- D4 không có generated-password flow, forced change hay email delivery. Admin biết credential; password tiếp tục hiệu lực và cần bàn giao ngoài hệ thống.

Dependency tách riêng: nối login/logout/session recovery với real Auth; bỏ public registration khỏi luồng V1. Không migrate các màn business mock không liên quan. Kiểm tra lại checkout trước khi làm để không implement trùng nếu dependency đã được hoàn tất ở task khác.

Chỉ chỉnh UI flow theo UX/requirement được chốt; không giữ một tương tác chỉ vì mock/UI document từng mô tả nó.

## 9. Schema impact

Đề xuất không đổi schema, không migration/re-scaffold cho scope này. Giữ nguyên snapshots v1.0/v1.1 và generated entities.

Users đủ credential/status/timestamps; UserRoles đủ single-role ở application; RefreshTokens đủ revocation; AuditLogs đủ append-only audit. Unique NormalizedUsername bảo vệ concurrent create.

Không hard delete vì Users được tham chiếu bởi role/token, tour/registration và event/audit history. Không thêm MustChangePassword, SecurityStamp, RowVersion hoặc bảng permission khi requirement chưa bắt buộc. Nếu D3 đổi thành permanent access-token invalidation, đánh giá lại contract/state thay vì giả vờ schema hiện tại đã giải quyết.

## 10. Tests và verification

### Backend acceptance

- [ ] Admin create thành công: normalized username đúng, hash verify được, active mặc định, đúng một role và một audit.
- [ ] Anonymous 401; Staff/Representative 403; ADMIN creation/target mutation bị chặn theo D1, gồm self và Admin cuối cùng.
- [ ] Invalid role/roles array/input bị reject; duplicate normalized username trả 409, kể cả concurrent create.
- [ ] Response/log/audit không lộ password/hash/token; persistence failure rollback User/UserRole/audit cùng nhau.
- [ ] Deactivate chặn login, refresh và request mới bằng JWT cũ; revoke + audit atomic.
- [ ] Reactivate cho login lại với credential cũ, không phục hồi refresh token revoked; test JWT cũ đúng D3.
- [ ] Repeat deactivate/reactivate không đổi timestamp hoặc nhân audit; lifecycle concurrency không partial write.
- [ ] Race Login/deactivate không để lọt refresh session có thể sống lại sau mở.
- [ ] SimulationPreview không bypass management authorization; account-status check fail-closed với invalid role/account.
- [ ] Giữ và chạy Auth/Initial Admin Seeder regression tests.

### Frontend và end-to-end

- [ ] List/loading/empty/error/pagination; create success, validation và duplicate conflict.
- [ ] Confirm/cancel khóa/mở; xử lý 401/403; role selection single-role; password state được xóa đúng.
- [ ] Navigation/route guard; real login/logout/session recovery; không public self-registration.
- [ ] Smoke test API thật: Admin tạo Staff -> Staff login -> khóa -> request bị chặn -> mở -> login lại được.

Chạy từ repo root sau implementation:

```bash
bash scripts/verify backend
bash scripts/verify web
```

SQL tests dùng `SMARTCAMPUS_SCHEMA_TEST_CONNECTION` theo `backend/database/README.md`, chỉ trên DB test/disposable theo convention, không reset app DB. Không in secret. Báo số passed/skipped và warnings/errors thực tế; thiếu SQL/env thì báo chưa full verify, không giả định 0 skipped. Số test mới sẽ tăng, không cố giữ tổng 7/37 từ task cũ. Kiểm tra UI thực tế theo `web/AGENTS.md`.

## 11. File impact dự kiến

| Khu vực | File/folder có thể tạo hoặc sửa khi implement |
|---|---|
| Application | `backend/src/SmartCampus.Application/Features/Accounts/`, repository abstraction trong `backend/src/SmartCampus.Application/Common/Abstractions/Persistence/` |
| Persistence | `backend/src/SmartCampus.Infrastructure/Persistence/Repositories/`, handwritten DbContext partial nếu cần commit-error mapping, Infrastructure DI |
| Auth integration hẹp | `backend/src/SmartCampus.Infrastructure/Authentication/EfAuthRepository.cs`, auth abstraction và Login persistence coordination; transaction boundary hiện hữu nếu cần |
| Api | `backend/src/SmartCampus.Api/Controllers/AdminAccountsController.cs`, status-validation/policy registration và `backend/src/SmartCampus.Api/Program.cs` |
| Tests | `backend/tests/SmartCampus.UnitTests/`, `backend/tests/SmartCampus.IntegrationTests/` |
| Web account feature | `web/src/api/contracts/admin-accounts.ts`, account hooks/dialog trong `web/src/features/administration/`, page trong `web/src/routes/admin/`, router/navigation và tests |
| Web Auth dependency | `web/src/auth/`, auth API binding và session integration tối thiểu; không redesign Backend Auth |
| Public docs | `docs/architecture.md` khi contract được chốt; scope/UI flow chỉ sửa phần behavior thực sự thay đổi |

Không tạo empty folder, abstraction hoặc file chỉ để khớp bảng này. Không sửa Seeder, schema generated, ADR hoặc docs unrelated để cleanup wording.

## 12. Thứ tự implementation và checklist

- [x] Audit local implementation, schema, authority và frontend dependency.
- [x] Lập một plan/checklist duy nhất; phân biệt hiện trạng, requirement và đề xuất.
- [ ] **Phase 0 — Chốt D1–D4.** Ghi quyết định/public contract đúng nơi; không coi plan là ADR đã accepted.
- [ ] **Phase 1 — Backend list/create.** Policy, validators, repository, DTO, create audit và unique-conflict mapping. Gate: create/list/security/rollback SQL tests pass.
- [ ] **Phase 2 — Lifecycle/session.** Deactivate/reactivate, active-state JWT check, refresh revocation và transaction coordination hẹp. Gate: lifecycle/idempotency/concurrency/Auth regressions pass.
- [ ] **Phase 3 — Real frontend Auth dependency.** Nối luồng còn mock, giữ backend contract. Gate: login/refresh/logout và session recovery với API thật pass.
- [ ] **Phase 4 — Account UI.** List/create/confirm khóa-mở và navigation; giữ Roles read-only. Gate: frontend tests + UI review pass.
- [ ] **Phase 5 — Final verification.** Verify backend/web, E2E, kiểm tra diff không unrelated change, docs phản ánh contract, báo đầy đủ skipped/limitations. Không commit/push nếu chưa được yêu cầu.
- [ ] **Kết thúc kế hoạch.** Đối chiếu contract lâu dài, reference và checklist; xóa file plan tạm này chỉ khi không làm mất thông tin duy nhất hoặc tài liệu vận hành.

## 13. Over-engineering check

Không generic repository/UserService, UoW mới, full Identity, permission engine, role hierarchy, reset lifecycle, bulk/import framework, Redis blacklist hoặc thêm dependency theo thói quen. Không mở rộng tất cả feature mock để làm account screen.

Unique-conflict handling, audit atomicity và phối hợp Login/deactivate là bảo đảm cho behavior thực tế, phải có tests; không dùng chúng làm lý do refactor toàn bộ Auth/pipeline.

## 14. Verdict

Plan sẵn sàng để review và chia implementation thành các phase nhỏ. Chưa coi D1–D4 là đã được chốt; đặc biệt không tự cấp quyền quản lý ADMIN hoặc hứa permanent JWT revocation.

Frontend real Auth là dependency hiện còn thiếu trong checkout được audit. Mục tiêu triển khai là bốn use case account management với schema hiện có, giữ kiến trúc và primitives hiện tại. Chưa implement hoặc chạy verification cho feature trong lượt lập plan.
