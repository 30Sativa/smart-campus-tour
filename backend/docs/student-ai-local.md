# Test AI thật trên trang Student lời mời

Chạy từ repo root bằng PowerShell, trong ba terminal riêng. Đây là fixture
Development để kiểm tra Q&A cá nhân qua API thật; không chứng minh vận hành
Tour/robot, livestream hay lời thuyết minh. Trang demo `/tour` vẫn dùng dữ liệu mẫu.

## Chuẩn bị

- SQL Server cục bộ; cấu hình `ConnectionStrings:DefaultConnection` trong User
  Secrets của API. Tài khoản cần quyền tạo database test. Với Windows Integrated
  Security, chạy terminal bằng tài khoản có quyền truy cập SQL Server.
- Python và dependencies theo `ai-assistant/README.md`; môi trường
  `ai-assistant/.venv` đã cài service.
- `ai-assistant/.env`: đặt `AI_SERVICE_KEY` ít nhất 16 ký tự,
  `GEMINI_API_KEY`, `GEMINI_MODEL` phù hợp với tài khoản. Không đưa key vào web.
- Web đã cài dependencies (`npm ci` trong `web/`). Chứng chỉ HTTPS Development
  của .NET đã được tin cậy; nếu cần, chạy `dotnet dev-certs https --trust`.

## Khởi chạy

Terminal 1 — AI thật:

```powershell
$env:PYTHONPATH = 'ai-assistant/src'
$env:AI_PROVIDER = 'gemini'
$env:AI_PORT = '8091'
& ai-assistant/.venv/Scripts/python.exe -m campus_assistant
```

Terminal 2 — tạo/reuse fixture và chạy API HTTPS ở cổng 7093:

```powershell
& backend/scripts/start-student-ai-local.ps1
```

Lần đầu, script tạo database mới tên `SmartCampusStudentAiLocal_<guid>` từ
schema v1.1, một Tour `RUNNING`, một lời mời `INDIVIDUAL` hạn 24 giờ. Script
không ghi vào database sản phẩm đã cấu hình. Email worker tắt; dữ liệu liên hệ
dùng miền `example.test`. Route không có robot hay stop. Các thông tin cục bộ
được lưu vào file Git bỏ qua:

- `backend/student-ai-entry.env`: URL `/tour/{tourId}` và mã test.
- `backend/student-ai-local.env`: cấu hình restart, gồm các khóa riêng của fixture.

Lần sau script dùng lại fixture. Sau khi mã hết hạn hoặc muốn fixture mới:

```powershell
& backend/scripts/start-student-ai-local.ps1 -NewFixture
```

Fixture mới dùng database mới và thay hai file trên; database cũ vẫn còn.
Chỉ xóa database test mang tên chính xác trong SQL Server sau khi không cần nữa.

Terminal 3 — web ở cổng 5174:

```powershell
Set-Location web
$env:VITE_API_BASE_URL = 'https://localhost:7093'
npm run dev -- --host localhost --port 5174 --strictPort
```

## Thử trên trình duyệt

1. Mở URL trong `backend/student-ai-entry.env`, nhập mã và bấm **Vào Tour**.
   Dùng cùng hostname `localhost`; cookie Student thuộc backend HTTPS.
2. Kiểm tra **Tour đang diễn ra**, **Phiên lời mời cá nhân** và Trợ lý AI.
3. Hỏi: **LiDAR và camera Astra hỗ trợ robot dẫn Tour như thế nào?**
   Chờ trạng thái tra cứu kết thúc; kiểm tra câu trả lời nói đúng vai trò của hai
   cảm biến theo nội dung đã duyệt. UI hiện chưa hiển thị danh sách nguồn.
4. Hỏi tiếp một câu dựa vào trả lời trước để kiểm tra lịch sử hội thoại.
   Dịch vụ chỉ dùng nội dung được duyệt; câu ngoài phạm vi có thể bị từ chối.
5. Reload: phiên Tour được khôi phục bằng cookie. Lịch sử chat chỉ ở bộ nhớ
   trang, nên reload sẽ xóa lịch sử chat.
6. Muốn chuyển từ trình duyệt này sang trình duyệt khác, bấm **Thoát phiên**
   trước. Cùng lời mời đang hoạt động ở browser khác sẽ trả lỗi 409.

Nếu UI báo mất kết nối, kiểm tra ba terminal và đúng cổng. Lỗi 503:
kiểm tra service 8091, service key đồng nhất và quyền/quota Gemini. Không đổi sang
provider `fake` để kết luận AI thật đã hoạt động.

## Kiểm tra tự động

```powershell
$env:UseArtifactsOutput = 'true'
$env:ArtifactsPath = Join-Path (Get-Location) 'backend/.artifacts/verification'
$env:PYTHONUTF8 = '1'
bash scripts/verify backend ai-assistant
```

Thư mục artifacts riêng tránh khóa file của backend đang chạy. Test backend
mặc định bỏ qua nhóm SQL nếu chưa đặt cấu hình SQL test; kiểm tra browser ở trên
chứng minh đường đi Student → backend → Gemini với fixture cục bộ.
