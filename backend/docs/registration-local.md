# Happy case đăng ký → duyệt → email → Student

Fixture Development dùng database riêng `SmartCampusRegistrationLocal_<guid>`.
Chỉ seed hai tài khoản test, một tuyến không vận hành robot và một Tour
SCHEDULED. Đơn, lời mời, mã và email đều đi qua workflow HTTP hiện có.

## Chuẩn bị

- SQL Server cục bộ và `ConnectionStrings:DefaultConnection` trong User Secrets;
  tài khoản Windows cần quyền tạo database.
- `Resend:ApiKey`, `Resend:From` trong User Secrets của API. Với sender
  `CampusTour <onboarding@resend.dev>`, người nhận test phải là email của tài khoản
  Resend; xem https://resend.com/docs/knowledge-base/403-error-resend-dev-domain.
- Dependencies web đã cài. Chứng chỉ Development .NET đã tin cậy
  (`dotnet dev-certs https --trust` nếu chưa).

Không paste key vào chat hay frontend. `backend/registration-local.env` chứa
khóa fixture; `backend/registration-entry.env` chứa tài khoản test. Cả hai được
Git bỏ qua. Resend key vẫn đọc từ User Secrets, không sao chép vào fixture.

## Khởi chạy từ repo root

Terminal API:

```powershell
& backend/scripts/start-registration-local.ps1
```

Terminal web:

```powershell
& backend/scripts/start-registration-local.ps1 -Web
```

API dùng `https://localhost:7094`; web dùng `https://localhost:5175`.
Web xuất chứng chỉ .NET hiện có vào thư mục artifacts để Vite phục vụ HTTPS.
Nếu Windows từ chối quyền SQL/certificate, dùng terminal có quyền của tài khoản
đã cấu hình SQL Server/certificate. Không bỏ qua cảnh báo chứng chỉ trong browser.

Chạy lại dùng database/tài khoản cũ. `-NewFixture` tạo database mới và thay file
settings/login; không xóa database cũ. Database test có thể xóa riêng bằng SQL
Server tooling khi không còn cần. Không chạy fixture trên database sản phẩm.

## Luồng trên giao diện

1. Mở `https://localhost:5175/login`, đăng nhập đại diện trong
   `backend/registration-entry.env`.
2. Chọn **Buổi tham quan** → **TEST LOCAL - Dang ky va Gmail** → **Đăng ký đoàn**.
3. Điền thông tin đoàn và email liên hệ. Email nhận lời mời lấy từ **dòng danh
   sách**, không lấy email liên hệ thay cho mọi người.
4. Tải file `.csv` hoặc `.xlsx` với cột `LoaiDong,HoTen,Email,Lop`. Test một dòng:
   `CA_NHAN,Hoc sinh test,<email tai khoan Resend>,TEST`. Xác nhận danh sách,
   kiểm tra đúng một người nhận, xác nhận quyền cung cấp dữ liệu rồi gửi đơn.
5. Đơn chuyển **Chờ duyệt**. Đăng xuất, đăng nhập admin test.
6. Vào **Đăng ký chờ duyệt**, mở đúng đoàn test và bấm **Duyệt**. Khi gửi thư
   bật, approve tạo lời mời và queue gửi trong cùng commit.
7. Xem trạng thái email trong drawer. **ACCEPTED** chỉ là nhà cung cấp chấp nhận;
   kiểm tra Gmail Inbox/Spam để xác nhận thư thực sự đến.
8. Mở link `/tour/{tourId}` trong thư, nhập mã trong chính thư để vào phòng chờ.
   Tour SCHEDULED không hiện chat AI; Start Tour là luồng vận hành riêng chưa có
   API live. Fixture AI RUNNING cũ phục vụ test chat riêng.

Link localhost chỉ dùng trên máy chạy test. Không mở từ điện thoại/máy khác rồi
mong truy cập được server này. Không thay link sang domain hosted nếu frontend
hosted chưa nối đúng database/backend test.

Nếu email FAILED, kiểm tra key/sender/recipient ở Resend. Gửi lại sau cooldown
chỉ gửi mã hiện hành, không xoay mã. Không approve lại hay tạo nhiều đơn để retry.

## Kiểm tra

```powershell
$env:UseArtifactsOutput = 'true'
$env:ArtifactsPath = Join-Path (Get-Location) 'backend/.artifacts/verification'
bash scripts/verify backend
```

Test tự động không gửi thư thật. Happy case trên browser và hộp thư là kiểm tra
tích hợp với nhà cung cấp; không suy ACCEPTED thành delivered hoặc read.
