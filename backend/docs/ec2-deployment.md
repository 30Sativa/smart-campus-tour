# Deploy backend + SQL Server trên một EC2

Các lệnh dưới đây chạy từ repo root trên **Ubuntu 24.04 x86_64**. Cấu hình
`backend/docker-compose.yml` chạy hai service lâu dài (`api`, `sqlserver`) và
một job `db-init`. Kestrel phục vụ HTTPS trực tiếp; không cần thêm reverse proxy.
Đây là cấu hình một máy, có downtime khi cập nhật/reboot; không có failover.

## 1. EC2 và network

- Điểm bắt đầu đề xuất: **t3.large, 2 vCPU / 8 GiB RAM**, EBS gp3 khoảng 40–60
  GiB, bật EBS encryption. Đây là sizing ban đầu, chưa phải kết quả load test.
  SQL container giới hạn 4 GiB, SQL memory limit 3072 MiB; BE giới hạn 1 GiB.
  T3 có CPU credits: theo dõi CPU, credit balance, RAM, disk và OOM khi chạy tải.
- Chọn AMI **amd64/x86_64**. Không chọn Graviton/t4g: SQL Server Linux container
  chỉ được hỗ trợ trên x86_64. Không dùng t3.micro cho BE + SQL Server.
- Security Group: inbound TCP **443** cho client; SSH **22 chỉ từ IP quản trị**
  hoặc dùng SSM. Không mở **1433**, 8080 hoặc 8443. Cấu hình này không cần port 80.
- Gắn Elastic IP nếu cần địa chỉ ổn định; DNS `api.example.com` trỏ tới EC2.
- Cài Docker Engine và Compose plugin theo
  [hướng dẫn Ubuntu của Docker](https://docs.docker.com/engine/install/ubuntu/).
  Yêu cầu Docker Compose v2 hiện hành với health/dependency conditions và BuildKit.
  Chỉ tài khoản quản trị được quyền sử dụng Docker.

Tham khảo sizing:
[AWS EC2 general purpose](https://docs.aws.amazon.com/ec2/latest/instancetypes/gp.html),
[SQL Server Linux requirements](https://learn.microsoft.com/en-us/sql/linux/sql-server-linux-setup?view=sql-server-ver16).

## 2. Secrets và TLS

```bash
cp backend/.env.example backend/.env
cp backend/deploy/api.env.example backend/deploy/api.env
chmod 600 backend/.env backend/deploy/api.env
mkdir -p backend/deploy/certs
```

Điền `backend/.env` bằng editor trên EC2; **không commit** file này:

| Biến | Cách điền |
|---|---|
| `SQL_SA_PASSWORD` | `Aa1!` + kết quả `openssl rand -hex 32` |
| `SQL_APP_PASSWORD` | Một giá trị khác: `Aa1!` + kết quả `openssl rand -hex 32` |
| `JWT_SIGNING_KEY` | Một kết quả khác: `openssl rand -hex 32` |
| `API_HOST` | Tên DNS của API, không có scheme/path/port |
| `WEB_ORIGIN` | Origin FE HTTPS chính xác, không có dấu `/` cuối |
| `TLS_CERT_PATH` | Đường dẫn tới PEM fullchain của domain API |
| `TLS_KEY_PATH` | Đường dẫn tới PEM private key tương ứng |
| `BACKEND_IMAGE` | Image local hoặc registry tag của đúng release |

`SQL_APP_PASSWORD` chỉ nhận 32–128 ký tự chữ, số, `!`, `_`, `-` để không thể phá
SQLCMD substitution hay connection string. Mật khẩu SQL vẫn phải đạt complexity
policy của SQL Server. Đặt secrets có `$` trong dấu nháy đơn theo cú pháp `.env`.
API chỉ nhận mật khẩu runtime; `sa` chỉ được cấp cho SQL/init.
Docker administrators có thể đọc environment của container: đây không phải secret
vault. Không gửi output `docker compose config`/`docker inspect` chứa secrets.
Dùng `config --quiet` khi chỉ cần kiểm tra cấu hình.

Dùng certificate được browser tin cậy cho đúng domain API, ví dụ Let's Encrypt
cấp bằng **DNS-01** trên host. Copy fullchain và private key vào các đường dẫn đã
khai báo; không COPY certificate vào Docker image. Với thư mục mặc định:

```bash
sudo chown 1654:1654 backend/deploy/certs/privkey.pem
sudo chmod 600 backend/deploy/certs/privkey.pem
chmod 644 backend/deploy/certs/fullchain.pem
```

UID 1654 là user `app` của base image .NET đang pin. Các thư mục cha phải cho phép
container traverse; cả hai file phải đọc được bởi UID này. Mount dùng
`create_host_path: false`, thiếu file sẽ fail thay vì tự tạo một directory rỗng.
Sau khi thay certificate, recreate API để bind mount nhận file mới:

```bash
docker compose --env-file backend/.env -f backend/docker-compose.yml up -d --no-deps --force-recreate api
```

Lên lịch renewal trên host và hook recreate trên; kiểm tra certificate từ bên
ngoài trước khi hết hạn. SQL kết nối mã hóa với certificate tự ký trong network
Docker riêng (`Encrypt=True;TrustServerCertificate=True`); không dùng thiết lập
trust này cho SQL Server ngoài host mà chưa cấu hình certificate tin cậy.

## 3. Build và khởi động

```bash
docker compose --env-file backend/.env -f backend/docker-compose.yml config --quiet
docker compose --env-file backend/.env -f backend/docker-compose.yml build --pull api
docker compose --env-file backend/.env -f backend/docker-compose.yml up -d --wait --wait-timeout 240 api
docker compose --env-file backend/.env -f backend/docker-compose.yml ps -a
```

Luồng: SQL healthy → `db-init` exit 0 → API healthy. `db-init` dùng snapshot
`backend/database/smart-campus-tour-schema-v1.1.sql` và permissions hiện có.
Schema được tạo trong transaction trên database trống; lỗi DDL rollback khi
SQLCMD thoát. Hash snapshot được lưu trong database extended property, chuẩn hóa
CRLF/LF. Chạy lại với cùng snapshot giữ dữ liệu, đồng bộ runtime login/password
và áp dụng lại permissions. Database có bảng nhưng không có marker, hoặc hash
khác, sẽ **fail**; không tự migration, drop hay thay thế database cũ.

API login `smartcampus_api` không có `sysadmin`/`db_owner`/DDL. Chỉ các bảng mà
use case hiện tại ghi mới có CRUD; bảng Tour/route/robot/branch chỉ được đọc.
`AuditLogs` và `TourEvents` chỉ SELECT/INSERT, DENY UPDATE/DELETE theo role hiện
có. Việc vận hành Tour/dispatch tương lai cần review permissions theo use case.
Initializer dành cho SQL instance do deployment này quản lý; provisioning một
database/user có quyền tùy chỉnh sẵn phải review thủ công trước khi đưa vào.

Mặc định **SQL Server 2022 Express**, dùng được cho production nhỏ nhưng giới hạn
10 GB/database và buffer pool khoảng 1410 MB. `Developer` chỉ dùng dev/test;
Standard cần license hợp lệ. Đổi edition cho volume đã có không phải thao tác
chỉ đổi env: làm theo quy trình edition upgrade của Microsoft.
Xem [SQL Server editions](https://learn.microsoft.com/en-us/sql/sql-server/editions-and-components-of-sql-server-2022?view=sql-server-ver16).

## 4. Tạo Admin và kết nối FE

Seed Admin là lệnh one-shot hiện có, không tự chạy mỗi lần API start. Không đưa
mật khẩu lên command line hay lưu trong Compose. Username hợp lệ, ví dụ
`system.admin`:

```bash
export INITIAL_ADMIN_USERNAME=system.admin
export INITIAL_ADMIN_FULL_NAME='CampusTour Admin'
read -rsp 'Initial Admin password: ' INITIAL_ADMIN_PASSWORD
echo
export INITIAL_ADMIN_PASSWORD
docker compose --env-file backend/.env -f backend/docker-compose.yml run --rm --no-deps seed-admin
unset INITIAL_ADMIN_USERNAME INITIAL_ADMIN_FULL_NAME INITIAL_ADMIN_PASSWORD
```

Chạy sau khi stack đã healthy. Seeder sẽ skip nếu Admin hợp lệ đã có, không reset
mật khẩu cũ. Compose cấp các biến seed chỉ cho service `seed-admin`.

Trên Vercel, đặt `VITE_API_BASE_URL=https://api.example.com`, rồi redeploy FE.
`WEB_ORIGIN` phải khớp origin FE vì API dùng cookie Secure/SameSite=None và CORS
credentials. Kiểm tra login → refresh → logout trong browser thực.
OpenAPI/SimulationPreview không public trong Production. Chưa có Tour/route demo
chỉ từ việc deploy: nạp dữ liệu kỹ thuật đã được review bằng quy trình database.

Email đang tắt trong `backend/deploy/api.env`. Muốn gửi invitation, điền tất cả
keys theo `backend/docs/invitations-resend.md`, bật `Invitations__Enabled=true`
và `Invitations__EmailWorkerEnabled=true`, rồi recreate API. Giữ ổn định và backup
hai crypto keys khác nhau; FE không được nhận keys/Resend key.

## 5. Vận hành, cập nhật và backup

```bash
# 401 ở route này là kết quả đúng khi không có refresh cookie; certificate phải hợp lệ.
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://api.example.com/api/auth/refresh
docker compose --env-file backend/.env -f backend/docker-compose.yml logs --tail 100 api db-init

# Dừng, giữ volume database.
docker compose --env-file backend/.env -f backend/docker-compose.yml down

# Sau khi cập nhật source, build và thay container API; có downtime ngắn.
docker compose --env-file backend/.env -f backend/docker-compose.yml build --pull api
docker compose --env-file backend/.env -f backend/docker-compose.yml up -d --no-deps --wait api
```

Healthcheck API kiểm tra hosting/auth trả 401, **không** chứng minh DB ready hay
nghiệp vụ chạy đúng. SQL có SELECT 1 healthcheck riêng. Docker không tự restart
container chỉ vì unhealthy; cần monitoring/alert bên ngoài cho trạng thái này.
Logging dùng rotation 10 MB × 3/service. SQL error logs nằm trong volume và disk
usage của volume vẫn cần theo dõi. `restart: unless-stopped` chạy lại sau reboot
khi Docker service bật; schema/database phải giữ nguyên.

Named volume `sqlserver-data` giữ cả data/log/backup trong `/var/opt/mssql`.
Giữ `COMPOSE_PROJECT_NAME` cố định: đổi tên sẽ chọn volume khác. **Không chạy
`down -v` hay volume prune với database đang dùng**. Volume không thay thế backup.

Ví dụ full backup thủ công, dùng mật khẩu SA đã có trong container thay vì
truyền mật khẩu qua command line:

```bash
docker compose --env-file backend/.env -f backend/docker-compose.yml exec -T sqlserver bash -c 'mkdir -p /var/opt/mssql/backup; export SQLCMDPASSWORD="$MSSQL_SA_PASSWORD"; /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -C -b -Q "BACKUP DATABASE [SmartCampusTourV11] TO DISK=N'\''/var/opt/mssql/backup/SmartCampusTourV11.bak'\'' WITH INIT, CHECKSUM;"'
mkdir -p backend/deploy/backups
docker compose --env-file backend/.env -f backend/docker-compose.yml cp sqlserver:/var/opt/mssql/backup/SmartCampusTourV11.bak backend/deploy/backups/SmartCampusTourV11.bak
chmod 600 backend/deploy/backups/SmartCampusTourV11.bak
```

Lưu bản backup có timestamp ra S3 private/encrypted với retention, dùng EC2 IAM
role thay vì AWS keys trong repo. Lên lịch full backup trên host; SQL Express
không có SQL Agent. Chọn lịch/RPO theo nhu cầu và thử restore trên database riêng
định kỳ. Cất `.env`/invitation crypto keys riêng an toàn, vì `.bak` không chứa
keys ngoài database. EBS encryption không tự mã hóa file backup đã copy ra host.

Image runtime dùng ASP.NET Ubuntu Noble + curl để probe HTTPS, có ICU cho tiếng
Việt/SqlClient. SDK/test/dev settings không đi vào image; publish Release không
apphost/debug symbols; NuGet restore và packages được cache qua BuildKit.
Không bật trimming/AOT do EF Core/MediatR/reflection. Pin version Microsoft images
để release có chủ đích; update patch/digest sau kiểm tra security và smoke test.
Tốt hơn khi vận hành lâu dài: build trên CI/máy build, push registry với tag commit
(và pin digest), đặt `BACKEND_IMAGE`, pull và `up --no-build`; không build SDK trên
EC2 đang phục vụ tải. Không prune toàn bộ Docker host để dọn một release.

## 6. Verification

```bash
bash scripts/verify backend
# Trên Linux có Docker engine; dùng project/volume tạm, tự xóa sau test.
bash backend/scripts/test-deployment
```

Smoke test dùng certificate tự ký/credentials tạm, kiểm tra HTTPS login và secure
cookie, seed/init chạy lại, non-root, không đóng gói dev settings, không publish
SQL port, permissions thực dưới API login, dữ liệu qua recreate, và từ chối
database có schema không đánh dấu. Port localhost mặc định 18443; đổi bằng
`DEPLOYMENT_TEST_PORT`. Test build thêm image tag local
`campustour-backend:deployment-test`; không đụng project/volume đang deploy.
`--insecure` chỉ dùng trong probe loopback và smoke test certificate tự ký;
kiểm tra browser/domain thật phải tin cậy certificate, không bỏ qua TLS validation.
