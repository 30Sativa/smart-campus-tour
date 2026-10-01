# ADR-0013: Một application role trên mỗi account V1

- Ngày: 01/10/2026.
- Trạng thái: **nhóm chấp nhận để triển khai**; GVHD xem lại ở Review 2. Không ghi nhận GVHD đã duyệt quyết định này.
- Phạm vi: role contract của Auth/Web V1; không thay đổi schema persistence.

## Context

`UserRoles` dùng khóa chính `(UserId, Role)`, nên persistence có thể lưu nhiều role cho một `User`. Business scope trước đây từng cho phép một người kiêm Admin và Staff. Auth/Web V1 lại biểu diễn một role duy nhất: login response có `role`, JWT có một `role` claim, frontend auth và route guard xử lý một role. Nếu không ghi rõ quyết định, khả năng của schema và hợp đồng application có vẻ mâu thuẫn.

## Decision

- Mỗi application account có đúng một role được Auth hỗ trợ: `ADMIN`, `STAFF`, hoặc `SCHOOL_REPRESENTATIVE`.
- Nếu một người cần thực hiện nhiều vai trò nghiệp vụ, người đó dùng account riêng cho từng role.
- Auth fail-closed: không có role, có nhiều role, hoặc có role không được hỗ trợ đều bị từ chối với HTTP 403.
- Giữ nguyên schema `UserRoles` và khóa chính `(UserId, Role)`; không thêm SQL constraint ép một role trên mỗi user trong V1. Single-role là invariant của application/Auth V1.
- Hỗ trợ multi-role sau này cần thay đổi public Auth contract và web, gồm JWT claims, login response, frontend role model/guards và tests.

## Consequences

- Backend và Web V1 chỉ cần xử lý một active role.
- Người kiêm vai cần quản lý nhiều account.
- Persistence vẫn linh hoạt, nhưng Auth từ chối account có nhiều role.
- Chuyển sang multi-role là contract change, không phải chỉ bật một flag.
