using Microsoft.AspNetCore.Mvc.Controllers;
using Microsoft.AspNetCore.Mvc.Abstractions;

namespace SmartCampus.Api.ApiDocumentation;

internal sealed record ApiOperationDetails(string Tag, string Summary, string Description);

/// <summary>Human-readable OpenAPI text kept next to the OpenAPI pipeline.</summary>
internal static class ApiOperationDocumentation
{
    private const string JwtErrors = "Errors: 400 for invalid input; 401 without a valid JWT; 403 when the JWT role is not allowed; 404 when a referenced record does not exist; 409 when the requested state or concurrency version conflicts. Only statuses applicable to the operation are returned.";
    private const string StaffLegacy = "This API belongs to the older deployment model. Current backend permission is Staff (product label: Tour Staff), including on the old `/api/admin` compatibility URL. Target business ownership belongs to Tour Staff; migration to the full target workflow is incomplete.";
    private const string AdminLegacy = "This API belongs to the older deployment model and currently requires Admin. Target ownership of the corresponding business work is moving to Tour Staff; that migration is not complete. Do not use this legacy endpoint to integrate the new map/POI workflow.";

    private static readonly IReadOnlyDictionary<string, (string Summary, string Description)> Operations =
        new Dictionary<string, (string, string)>(StringComparer.Ordinal)
        {
            ["RouteRevisionsController.List"] = ("[Tour Staff/Technical Staff] Liệt kê tuyến VERSIONED", "Pages current revisions of VERSIONED routes only, including unsubmitted drafts; it never mixes legacy catalog rows or emits multiple history rows for one Route. Requires Staff or TechnicalStaff. Supports `search`, `mapVersionId`, `page`, `size` (1–100), and `sort` (`name`, `-name`, `createdAt`, `-createdAt`). Each item is the full current revision view with exact map version/key, submit state, effective navigation result/source TestRun, dwell subtotal, and incomplete content/audio duration status. Invalid paging/sort returns 400; missing JWT 401; unsupported role 403. A TestRun is manual navigation evidence, not duration completion or Tour READY. " + JwtErrors),
            ["AdminAccountsController.List"] = ("[Admin] Liệt kê và tìm tài khoản", "Lists safe account summaries with paging and optional search/sort. Requires the Admin JWT role. `page` and `size` control the page; `expand` is unsupported. Does not expose credentials. " + JwtErrors),
            ["AdminAccountsController.Create"] = ("[Admin] Tạo tài khoản người dùng", "Creates one account using `username`, `fullName`, `role`, and `initialPassword`. Supported roles are the backend application roles, including `TechnicalStaff`; each account has exactly one role. Requires Admin. A normalized duplicate username conflicts (409); invalid or unsupported role/input is 400. " + JwtErrors),
            ["AdminAccountsController.Deactivate"] = ("[Admin] Vô hiệu hóa tài khoản", "Deactivates the account identified by `id`; repeat calls are idempotent where allowed by the account lifecycle. Requires Admin. A missing account returns 404; a forbidden target returns 403. " + JwtErrors),
            ["AdminAccountsController.Reactivate"] = ("[Admin] Kích hoạt lại tài khoản", "Reactivates the account identified by `id` under the account lifecycle rules. Requires Admin. A missing account returns 404; a forbidden target returns 403. " + JwtErrors),

            ["MapPoiController.UploadMap"] = ("[Technical Staff] Upload gói ROS map và tạo phiên bản", "Validates a ROS map ZIP and stores an immutable map version for `areaKey`/`areaName`. Multipart fields: `requestId` (stable retry key) and `package`; the server computes SHA-256 and version number. Requires TechnicalStaff. Uploading validates and stores a package only: it does not deploy the map to a robot or establish deployment evidence. Invalid/oversized packages return 400; conflicting idempotency/version state returns 409; role failures return 403. " + JwtErrors),
            ["MapPoiController.ListMaps"] = ("[Tour Staff/Technical Staff] Xem các phiên bản map", "Lists map version metadata, optionally filtered by `areaKey`, with `take` capped by backend validation. Read permission is currently Staff or TechnicalStaff. This returns stored versions and recorded deployment status; it does not inspect a robot. Invalid `take` returns 400. " + JwtErrors),
            ["MapPoiController.GetMap"] = ("[Tour Staff/Technical Staff] Xem chi tiết phiên bản map", "Reads metadata for the immutable map version identified by `id`, including its recorded deployment check. Current permission is Staff or TechnicalStaff. A recorded check is historical human-entered evidence, not live robot inspection. Missing version returns 404. " + JwtErrors),
            ["MapPoiController.DownloadMap"] = ("[Tour Staff/Technical Staff] Tải gói map theo phiên bản", "Downloads the exact stored ZIP for `id`; response includes a SHA-256 ETag for the immutable package. Current permission is Staff or TechnicalStaff. Downloading does not deploy the package. Missing version returns 404. " + JwtErrors),
            ["MapPoiController.RecordDeployment"] = ("[Technical Staff] Ghi nhận kiểm tra triển khai map", "Appends a manual deployment/localization/display check for map version `id`. Body fields include `requestId`, `robotCode`, exact `packageSha256`, `localizationPassed`, `displayPassed`, and required `evidenceNote`. Requires TechnicalStaff. The backend verifies the referenced physical robot and exact package checksum; this record is submitted human evidence, not an executed robot test. Invalid evidence returns 400; missing robot/version 404; conflicting idempotency or deployment state 409. " + JwtErrors),
            ["MapPoiController.ListDeploymentChecks"] = ("[Technical Staff] Xem lịch sử kiểm tra triển khai map", "Returns append-only manual deployment-check records for map version `id`. Requires TechnicalStaff. The history records who submitted each check and does not query the robot. Missing version returns 404. " + JwtErrors),
            ["MapPoiController.CreateProposal"] = ("[Tour Staff] Tạo đề xuất POI chưa kiểm chứng", "Creates a POI proposal and its first draft revision against the supplied `mapVersionId`; the request contains a stable `requestId` and POI draft data. Requires Staff (Tour Staff product label). Creation sets draft/not-checked state and validates the pose against the stored map; it is not a PASS result. Invalid pose or request returns 400; missing map returns 404; reused requestId with different content returns 409. " + JwtErrors),
            ["MapPoiController.ListProposals"] = ("[Tour Staff/Technical Staff] Liệt kê đề xuất POI", "Lists proposals, optionally filtered by `mapVersionId`. Current read permission is Staff or TechnicalStaff. Results include current revision and technical status; submitting a proposal does not itself verify it. Invalid filter/input returns 400. " + JwtErrors),
            ["MapPoiController.GetProposal"] = ("[Tour Staff/Technical Staff] Xem đề xuất POI và trạng thái", "Reads a proposal by `id`, including its current `revision`, `rowVersion`, map version and verification status. Current read permission is Staff or TechnicalStaff. Missing proposal returns 404. " + JwtErrors),
            ["MapPoiController.GetProposalHistory"] = ("[Tour Staff/Technical Staff] Xem lịch sử revision và kiểm chứng POI", "Returns immutable revisions and recorded verification history for proposal `id`. Current read permission is Staff or TechnicalStaff. History is scoped to the submitted revision/fingerprint and evidence captured for it. Missing proposal returns 404. " + JwtErrors),
            ["MapPoiController.ReviseProposal"] = ("[Tour Staff] Tạo revision nháp cho đề xuất POI", "Creates the next immutable draft revision. Body includes `requestId`, `expectedCurrentRevision`, `expectedRowVersion`, and draft fields including the exact `mapVersionId`. Requires Staff. Stale revision/rowVersion conflicts return 409. A movement-affecting change has a different navigation fingerprint and needs new technical verification; an old revision/result remains available for its original configuration. " + JwtErrors),
            ["MapPoiController.SubmitProposal"] = ("[Tour Staff] Gửi revision POI để kiểm chứng", "Submits the current draft revision for Technical Staff review. Body includes `requestId`, `expectedRevisionNumber`, and `expectedRowVersion`. Requires Staff. Submission changes the revision workflow state only; it does not mean the POI has passed. A stale, already-submitted, or otherwise incompatible state returns 409. " + JwtErrors),
            ["MapPoiController.VerificationQueue"] = ("[Technical Staff] Xem hàng đợi kiểm chứng POI", "Lists submitted current POI revisions that still need a result, optionally filtered by `mapVersionId`. Requires TechnicalStaff. Queue eligibility is based on the current revision and its navigation fingerprint; a prior result remains tied to its revision/fingerprint and is not copied to a changed movement configuration. " + JwtErrors),
            ["MapPoiController.RecordVerification"] = ("[Technical Staff] Ghi nhận PASS/FAIL cho revision POI", "Appends one technical result for proposal `id` and `revisionNumber`. Body includes `requestId`, `expectedRevisionNumber`, `expectedRowVersion`, `robotCode`, `resultCode`, reach/stop/localization/camera observations, and evidence or failure reason. Requires TechnicalStaff. PASS requires all required observations and matching deployed-map evidence for the exact `mapVersionId`/checksum and navigation fingerprint; FAIL requires a failed observation and reason. This is recorded human evidence, not proof the backend executed a physical test. Stale state/already-recorded result returns 409; missing map/robot/proposal returns 404; invalid evidence returns 400. " + JwtErrors),

            ["StaffPoisController.List"] = ("[LEGACY — Tour Staff] Liệt kê POI catalog theo mô hình cũ", StaffLegacy + " Lists legacy POI catalog records. For the new POI workflow use only `/api/staff/poi-proposals` and Technical verification at `/api/technical/poi-verifications` plus `/api/technical/poi-proposals/{id}/revisions/{revisionNumber}/verification`. These APIs do not replace Route, Tour, or Registration workflows."),
            ["StaffPoisController.Get"] = ("[LEGACY — Tour Staff] Xem POI catalog theo mô hình cũ", StaffLegacy + " Reads legacy POI `id`. For the new POI workflow use only `/api/staff/poi-proposals` and the two Technical verification APIs. This legacy catalog is not the revisioned map-linked workflow."),
            ["StaffPoisController.Create"] = ("[LEGACY — Tour Staff] Tạo POI catalog theo mô hình cũ", StaffLegacy + " Creates a legacy POI initially inactive. For the new POI workflow use only `/api/staff/poi-proposals` and the Technical verification APIs; this endpoint does not create a versioned proposal."),
            ["StaffPoisController.Update"] = ("[LEGACY — Tour Staff] Cập nhật POI catalog theo mô hình cũ", StaffLegacy + " Updates legacy POI `id`. This is not a versioned proposal/revision. For the new POI workflow use only `/api/staff/poi-proposals` and the Technical verification APIs."),
            ["StaffPoisController.Activate"] = ("[LEGACY — Tour Staff] Kích hoạt POI catalog theo mô hình cũ", StaffLegacy + " Activates legacy POI `id` using `expectedRowVersion`; stale row version returns 409. For the new POI workflow use only `/api/staff/poi-proposals` and the Technical verification APIs."),
            ["StaffPoisController.Deactivate"] = ("[LEGACY — Tour Staff] Ngừng kích hoạt POI catalog theo mô hình cũ", StaffLegacy + " Deactivates legacy POI `id` using `expectedRowVersion`; stale row version returns 409."),

            ["StaffRoutesController.List"] = ("[LEGACY — Tour Staff] Liệt kê tuyến theo mô hình hiện tại", StaffLegacy + " Lists persisted Route records. Route certification against exact map/POI versions and schedule readiness are not implemented here."),
            ["StaffRoutesController.Get"] = ("[LEGACY — Tour Staff] Xem tuyến theo mô hình hiện tại", StaffLegacy + " Reads persisted Route `id`; missing route returns 404. This is not a versioned route-verification result."),
            ["StaffRoutesController.Create"] = ("[LEGACY — Tour Staff] Tạo tuyến theo mô hình hiện tại", StaffLegacy + " Creates a persisted Route, initially inactive. Route versioning/certification and schedule readiness are not implemented here."),
            ["StaffRoutesController.Update"] = ("[LEGACY — Tour Staff] Cập nhật tuyến theo mô hình hiện tại", StaffLegacy + " Updates persisted Route `id`; the operation does not establish route certification."),
            ["StaffRoutesController.Activate"] = ("[LEGACY — Tour Staff] Kích hoạt tuyến catalog", StaffLegacy + " Activates the current persisted Route using `expectedVersion`. Stale version returns 409; activation is not route technical verification."),
            ["StaffRoutesController.Deactivate"] = ("[LEGACY — Tour Staff] Ngừng kích hoạt tuyến catalog", StaffLegacy + " Deactivates the current persisted Route using `expectedVersion`. Stale version returns 409."),
            ["StaffRoutesController.Delete"] = ("[LEGACY — Tour Staff] Xóa tuyến catalog", StaffLegacy + " Deletes persisted Route `id` using `expectedVersion`. Stale or referenced-state conflicts return 409; missing Route returns 404."),

            ["RouteRevisionsController.Create"] = ("[Tour Staff] Tạo tuyến revision nháp", "Creates a versioned route identity and immutable revision 1 from `mapVersionId` and exact `poiRevisionId` values. Requires Staff (product label Tour Staff). Each selected POI must have an effective navigation PASS for the same exact map version; request includes `requestId`, `expectedCurrentRevision=0`, route poses, ordered stops and dwell. This stores manual preparation data only; it does not submit, verify, schedule or activate a tour. Invalid pose/input returns 400; missing IDs 404; stale, reused idempotency key, mismatched map or missing/currently superseded POI PASS returns 409. " + JwtErrors),
            ["RouteRevisionsController.Revise"] = ("[Tour Staff] Tạo route revision tiếp theo", "Appends an immutable draft revision under the existing versioned Route ID. `expectedCurrentRevision` protects concurrent edits; map/POI revision IDs are exact references, never resolved to latest by read. A new navigation fingerprint requires its own whole-route test; earlier revisions and test evidence remain available. Requires Staff. Validation returns 400; missing Route/map/POI 404; stale revision, invalidated POI evidence or idempotency conflict 409. " + JwtErrors),
            ["RouteRevisionsController.Submit"] = ("[Tour Staff] Gửi revision để kiểm tra tuyến", "Appends a submission receipt for the exact current `revisionId`; body contains `requestId` and `expectedCurrentRevision`. All selected POI verification evidence must still be the effective PASS. Requires Staff. Submission is separate from technical result and does not set READY or schedule a Tour. Missing records return 404; stale state, already-submitted revision or invalidated POI evidence return 409. " + JwtErrors),
            ["RouteRevisionsController.History"] = ("[Tour Staff/Technical Staff] Xem revision và lịch sử kiểm tra tuyến", "Reads the requested `revisionId` (or current revision if omitted), exact map/checksum, ordered POI revision and source-evidence IDs, submission state, manual test records and current route-test result. `includeHistory` controls whether all test runs are returned. Requires Staff or TechnicalStaff. `durationStatus=INCOMPLETE_CONTENT_AUDIO_DATA` means the new approved content/audio duration source is not yet implemented; dwell sum is reported separately and is not represented as total tour duration. Missing Route/revision returns 404. " + JwtErrors),
            ["RouteRevisionsController.Queue"] = ("[Technical Staff] Xem hàng đợi kiểm tra toàn tuyến", "Lists submitted versioned route revisions that have no whole-route test run yet. Requires TechnicalStaff; Staff cannot record technical results. Each item includes exact revision, map/checksum, POI revisions and source POI PASS evidence. This is a human test queue, not robot dispatch. " + JwtErrors),
            ["RouteRevisionsController.RecordRun"] = ("[Technical Staff] Ghi nhận PASS/FAIL chạy thử toàn tuyến", "Appends manual whole-route test evidence for a submitted exact `revisionId`. Body fields include `requestId`, physical `robotCode`, distinct active participating Staff account, `resultCode`, all-stop/localization/safe-stop observations, measured duration, evidence and failure reason. The backend locks and checks the robot's latest manual deployment evidence across maps and requires the exact map version/checksum. PASS requires every route observation; FAIL requires a reason and a failed observation. This records human evidence, not robot control or proof beyond submitted observations. Missing records return 404; invalid input 400; role 403; stale deployment/POI state, retry-content conflict or invalid workflow 409. " + JwtErrors),

            ["StaffToursController.List"] = ("[LEGACY — Tour Staff] Liệt kê tour theo mô hình hiện tại", StaffLegacy + " Lists persisted Tours with paging and optional state/time filters. Complete SRS scheduling/reservation/READY behavior is not implemented here."),
            ["StaffToursController.Get"] = ("[LEGACY — Tour Staff] Xem tour theo mô hình hiện tại", StaffLegacy + " Reads Tour `id`; missing Tour returns 404. This does not imply READY or operational assignment behavior."),
            ["StaffToursController.Create"] = ("[LEGACY — Tour Staff] Tạo tour SCHEDULED theo mô hình hiện tại", StaffLegacy + " Creates a Tour in SCHEDULED state using the existing request contract. This is not the target schedule/reservation/READY validation flow."),
            ["StaffToursController.Update"] = ("[LEGACY — Tour Staff] Cập nhật tour theo mô hình hiện tại", StaffLegacy + " Updates Tour `id` under current lifecycle and concurrency rules. It does not provide the full target assignment or readiness gate."),
            ["StaffToursController.Cancel"] = ("[LEGACY — Tour Staff] Hủy tour trước khi bắt đầu", StaffLegacy + " Cancels a pre-Start Tour. This is not runtime End Early; the SRS F-14 Admin exception remains pending."),

            ["StaffRegistrationsController.List"] = ("[LEGACY — Tour Staff] Liệt kê hồ sơ đăng ký", StaffLegacy + " Lists registration-review records with filters. This is the existing aggregate review workflow, not full row-level target semantics."),
            ["StaffRegistrationsController.Get"] = ("[LEGACY — Tour Staff] Xem hồ sơ đăng ký", StaffLegacy + " Reads registration `id`; missing registration returns 404. Row-level migration remains separate."),
            ["StaffRegistrationsController.Approve"] = ("[LEGACY — Tour Staff] Duyệt hồ sơ đăng ký", StaffLegacy + " Approves registration `id` using the review request. State/concurrency conflict returns 409; missing registration returns 404."),
            ["StaffRegistrationsController.Reject"] = ("[LEGACY — Tour Staff] Từ chối hồ sơ đăng ký", StaffLegacy + " Rejects registration `id` using the review request. State/concurrency conflict returns 409; missing registration returns 404."),
            ["StaffRegistrationsController.CorrectEmail"] = ("[LEGACY — Admin] Sửa email roster theo quy trình cũ", AdminLegacy + " This exact email-correction action still requires Admin. The target process calls for a Tour Staff request/review workflow, which is not implemented here. Validation/state errors can return 400/404/409."),

            ["AuthController.Login"] = ("Đăng nhập và nhận access token", "Authenticates username/password and sets the refresh-token cookie. Anonymous endpoint; request origin must be allowed by backend configuration. Invalid credentials are rejected; login rate limiting applies. The response contains the JWT `accessToken` and role."),
            ["AuthController.Refresh"] = ("Làm mới phiên đăng nhập", "Uses the HttpOnly refresh cookie to issue a new access token and refresh cookie. Anonymous transport endpoint; the cookie and allowed request origin are required. Invalid/expired or blocked sessions return 401/403 and clear the refresh cookie."),
            ["AuthController.Logout"] = ("Đăng xuất và thu hồi refresh token", "Revokes the refresh token presented in the HttpOnly cookie when valid, then clears the cookie. Anonymous transport endpoint; request origin must be allowed. Returns 204 after processing."),
            ["FleetSyncController.Sync"] = ("[Robot] Gửi telemetry lên Fleet Sync", "Accepts an authenticated robot telemetry report over the dedicated robot credential scheme, not a user JWT. `StreamId` and `Seq` support duplicate reconciliation; `ReportedAt`, map/frame, pose, status and health fields carry telemetry. This endpoint is telemetry-only and returns no movement commands. Invalid reports return 400; invalid robot credentials return 401; rate limiting may return 429."),
            ["InvitationsController.Get"] = ("[Staff/Representative] Xem lời mời trong phạm vi hồ sơ", "Reads invitation records for `registrationId`. Staff can manage registrations; Representative access is scoped to their own registration. Requires Staff or Representative JWT. Missing/out-of-scope records return 404/403 as enforced by the handler."),
            ["InvitationsController.Issue"] = ("[Staff/Representative] Phát hành lời mời", "Issues invitations for `registrationId` using the supplied request and current registration rules. Staff access is managed; Representative is limited to their own registration. Requires Staff or Representative JWT. Invalid or ineligible registration returns 400/403/404/409 as applicable."),
            ["InvitationsController.Resend"] = ("[Staff/Representative] Gửi lại lời mời", "Resends the invitation identified by `invitationId` under `registrationId`. Representative is limited to their own registration; Staff can manage registrations. Requires Staff or Representative JWT. State, ownership, validation or missing-record errors return 400/403/404/409 as applicable."),
            ["InvitationsController.Reissue"] = ("[Staff/Representative] Cấp lại mã lời mời", "Reissues access for an existing invitation under `registrationId` and `invitationId`; this may replace credential state according to current invitation rules. Requires Staff or the owning Representative. State/ownership errors return 403/404/409; invalid request returns 400."),
            ["InvitationsController.Revoke"] = ("[Staff/Representative] Thu hồi lời mời", "Revokes the invitation identified by `invitationId` within `registrationId`. Requires Staff or the owning Representative. Successful revocation affects subsequent access checks; missing/out-of-scope or conflicting state returns 403/404/409 as applicable."),
            ["RepresentativeController.Tours"] = ("[Representative] Xem danh sách tour có thể đăng ký", "Lists tours available to the authenticated Representative with standard paging/search filters. Requires Representative JWT. Invalid paging/filter values return 400."),
            ["RepresentativeController.Tour"] = ("[Representative] Xem tour", "Reads tour details by `id` for an authenticated Representative. Requires Representative JWT; missing or inaccessible tour returns 404/403 as enforced by the query."),
            ["RepresentativeController.Registrations"] = ("[Representative] Xem danh sách đăng ký của mình", "Lists the current Representative's registrations, optionally filtered by tour, state and group. Requires Representative JWT; results are owner-scoped."),
            ["RepresentativeController.Registration"] = ("[Representative] Xem chi tiết đăng ký của mình", "Reads registration details by `id` for its owning Representative. Requires Representative JWT; another owner's registration is not accessible."),
            ["RepresentativeController.Submit"] = ("[Representative] Gửi đăng ký tour", "Creates a registration for tour `id`. Requires Representative JWT and a non-empty UUID `Idempotency-Key` header; the key makes retries safe. Invalid input/key returns 400; missing/ineligible tour or duplicate/state conflict returns 404/409."),
            ["RepresentativeController.Update"] = ("[Representative] Cập nhật bản nháp đăng ký", "Replaces the current registration draft by `id` using the submitted roster request. Requires Representative JWT and ownership; current policy restricts edits by registration state/invitation status. Stale or closed state returns 403/409; invalid request returns 400."),
            ["RepresentativeController.Resubmit"] = ("[Representative] Gửi lại đăng ký", "Resubmits registration `id` after correction using the replacement request. Requires owning Representative JWT and an eligible current state; invalid or conflicting state returns 400/403/409."),
            ["RepresentativeController.Cancel"] = ("[Representative] Hủy đăng ký", "Cancels registration `id` using the request/reason. Requires owning Representative JWT and an eligible registration state; missing, unauthorized or conflicting state returns 403/404/409."),
            ["StudentAccessController.Join"] = ("[Viewer] Tham gia tour bằng lời mời", "Exchanges an access code for the tour-scoped HttpOnly Viewer session cookie. No Viewer account or JWT is created. Requires an eligible invitation and allowed request origin; code/eligibility failures return 400/401/403, and join rate limiting may return 429."),
            ["StudentAccessController.Session"] = ("[Viewer] Khôi phục phiên tour", "Validates the existing tour-scoped Viewer session cookie and returns current access information. Anonymous cookie-based endpoint; it does not create a new account. Missing, expired, revoked or ineligible session is rejected."),
            ["StudentAccessController.Leave"] = ("[Viewer] Rời phiên tour", "Ends the current tour-scoped Viewer session and clears its cookie. Anonymous cookie-based endpoint; session revocation affects subsequent requests."),
            ["StudentTourController.View"] = ("[Viewer] Xem nội dung tour và tiến độ", "Returns route/progress information for `tourId` after validating its Viewer session cookie. No account or bearer JWT is used. Missing, expired or revoked session is rejected; response is not cached."),
            ["StudentQuestionsController.Ask"] = ("[Viewer] Gửi câu hỏi riêng trong tour", "Answers a question for `tourId` using the Viewer session cookie. Body includes `questionId`, `text` and optional recent turns; access and current per-session limits are enforced server-side. Invalid request/session returns 400/401/403; rate limits may return 429. This does not imply the future instance-wide 8/20 admission target is implemented."),
            ["SimulationController.Publish"] = ("[Development] Gửi pose mô phỏng", "Publishes a pose to the development SimulationPreview projection. This endpoint is excluded from OpenAPI unless SimulationPreview is enabled. It is not a production robot control or Fleet Sync endpoint."),
        };

    public static bool TryGet(ActionDescriptor descriptor, string? relativePath, out ApiOperationDetails details)
    {
        string controllerTypeName;
        string methodName;
        if (descriptor is ControllerActionDescriptor action)
        {
            controllerTypeName = action.ControllerTypeInfo.Name;
            methodName = action.MethodInfo.Name;
        }
        else
        {
            var displayName = descriptor.DisplayName?.Split('(')[0].Trim();
            var segments = displayName?.Split('.', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
            if (segments is not { Length: >= 2 } || !segments[^2].EndsWith("Controller", StringComparison.Ordinal))
            {
                details = default!;
                return false;
            }
            controllerTypeName = segments[^2];
            methodName = segments[^1];
        }

        var controllerName = controllerTypeName.EndsWith("Controller", StringComparison.Ordinal)
            ? controllerTypeName[..^"Controller".Length]
            : controllerTypeName;
        var key = $"{controllerTypeName}.{methodName}";
        if (!Operations.TryGetValue(key, out var text))
        {
            details = default!;
            return false;
        }

        var path = "/" + (relativePath ?? string.Empty).TrimStart('/');
        var (tag, summary, description) = ResolveTag(controllerName, path, text.Summary, text.Description);
        details = new(tag, summary, description);
        return true;
    }

    public static bool TryGetInfrastructureEndpoint(string? relativePath, out ApiOperationDetails details)
    {
        var path = "/" + (relativePath ?? string.Empty).TrimStart('/');
        details = path switch
        {
            "/health/live" => new("Health", "[Platform] Kiểm tra API process đang hoạt động", "Liveness probe only. It does not prove database readiness or external dependency health."),
            "/health/ready" => new("Health", "[Platform] Kiểm tra API readiness", "Readiness probe reports whether the API is ready according to its configured health checks. It is anonymous and does not grant business API access."),
            _ => default!
        };
        return details is not null;
    }

    private static (string Tag, string Summary, string Description) ResolveTag(
        string controller, string path, string summary, string description)
    {
        if (controller == "MapPoi")
        {
            if (path.Contains("/poi-verifications", StringComparison.Ordinal) || path.Contains("/verification", StringComparison.Ordinal))
                return ("Technical Staff — POI Verification", summary, description);
            if (path.Contains("/poi-proposals", StringComparison.Ordinal))
                return ("Tour Staff — POI Proposals", summary, description);
            return ("Technical Staff — Maps", summary, description);
        }

        if (controller == "AdminAccounts") return ("Admin — Accounts", summary, description);
        if (controller == "StaffPois")
            return path.StartsWith("/api/admin/pois", StringComparison.Ordinal)
                ? ("LEGACY — Admin POI URL (Staff-only alias)", summary, description + " This old Admin URL is a Staff-only compatibility alias. For the new POI workflow, use only `/api/staff/poi-proposals` and Technical verification at `/api/technical/poi-verifications` plus `/api/technical/poi-proposals/{id}/revisions/{revisionNumber}/verification`; these do not replace Route, Tour, or Registration APIs.")
                : ("LEGACY — Tour Staff POI Catalog", summary, description);
        if (controller == "StaffRoutes")
            return path.StartsWith("/api/admin/routes", StringComparison.Ordinal)
                ? ("LEGACY — Admin Routes URL (Staff-only alias)", summary, description + " The old Admin URL is currently authorized for Staff only.")
                : ("LEGACY — Tour Staff Routes", summary, description);
        if (controller == "RouteRevisions")
        {
            if (path == "/api/routes")
                return ("Tour Staff / Technical Staff — Versioned Route Catalog", summary, description);
            if (path.StartsWith("/api/technical/route-verifications", StringComparison.Ordinal) || path.StartsWith("/api/technical/routes", StringComparison.Ordinal))
                return ("Technical Staff — Route Verification", summary, description);
            if (path.StartsWith("/api/staff/routes", StringComparison.Ordinal))
                return ("Tour Staff — Route Revisions", summary, description);
            return ("Route Revisions — Staff / Technical Staff", summary, description);
        }
        if (controller == "StaffTours")
            return path.StartsWith("/api/admin/tours", StringComparison.Ordinal)
                ? ("LEGACY — Admin Tours URL (Staff-only alias)", summary, description + " The old Admin URL is currently authorized for Staff only.")
                : ("LEGACY — Tour Staff Tours", summary, description);
        if (controller == "StaffRegistrations")
        {
            if (path.Contains("/roster/", StringComparison.Ordinal))
                return ("LEGACY — Admin Registration Email Correction", summary, description);
            return path.StartsWith("/api/admin/registrations", StringComparison.Ordinal)
                ? ("LEGACY — Admin Registration Review URL (Staff-only alias)", summary, description + " This review URL currently requires Staff; the separate email-correction action still requires Admin.")
                : ("LEGACY — Tour Staff Registration Review", summary, description);
        }
        if (controller == "Auth") return ("Authentication", summary, description);
        if (controller == "FleetSync") return ("Robot — Fleet Sync (telemetry only)", summary, description);
        if (controller == "Invitations") return ("Invitations — Staff / Representative", summary, description);
        if (controller == "Representative") return ("Representative", summary, description);
        if (controller == "StudentAccess" || controller == "StudentTour") return ("Viewer — Tour Session", summary, description);
        if (controller == "StudentQuestions") return ("Viewer — Q&A", summary, description);
        if (controller == "Simulation") return ("Development — Simulation Preview", summary, description);
        return (controller, summary, description);
    }
}
