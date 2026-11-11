# Map và POI của robot thật

## Map

| File | Ảnh | Dùng ở đâu | Trạng thái |
|---|---|---|---|
| `map2.yaml` | `map_fix.pgm` (5 cm/px, origin −15.3, −76.1) | Baseline 02/11 (`robot-baseline-2026-11-02.md`), mọi POI ở đây, `route_test`, `test_nav2_baseline_contract.py` | **Map đang dùng.** Không sửa hay ghi đè |
| `map2.pgm` | — | Không file nào trỏ tới | Ảnh SLAM gốc ngày 22/09, trước khi sửa tay thành `map_fix.pgm` (23/09, 02/10). Giữ làm nguồn gốc của `map_fix.pgm` |
| `map1.yaml` + `map1.pgm` | 5 cm/px | Chỉ làm tên mẫu trong `tools/route_test` và test import POI của web | Map cũ 22/09; không có POI |
| `campus_map.yaml` + `campus_map.pgm` | 10 cm/px, origin 0,0 | Ví dụ lệnh trong `robot_navigation/README.md` và mô tả tham số `map` của `localization.launch.py` | Map cũ 24/09; không có POI |

`map2.yaml` trỏ tới `map_fix.pgm`, **không** trỏ tới `map2.pgm`. Đó là chủ ý, không phải lỗi.

## POI

| File | Map | Ghi chú |
|---|---|---|
| `poi_start.yaml` | `map2.yaml` | START, `verified: false` |
| `poi_01.yaml` | `map2.yaml` | POI_01, `verified: false` |
| `poi_records/` | `map2.yaml` | Bản ghi khôi phục từ MiniPC (POI_02, POI_03); xem README ở đó |

Một POI chỉ có nghĩa trên đúng map và frame ghi trong file. POI production đến từ backend
(Route/POI, ADR-0017/0038); các file ở đây là fixture thử nghiệm.

## Map mới tạo khi BUILD MAP

1. Lưu vào **thư mục phiên**, không lưu vào thư mục này (`docs/test-readiness-2026-11-10.md` §5.2):
   ```bash
   ros2 run nav2_map_server map_saver_cli -f ~/amr_logs/runs/<phiên>/map_<tên> --ros-args -r map:=/robot_01/map
   ```
2. Chỉ đưa vào repo khi đã chạy NAV2 trên map đó và đạt tiêu chí.
   - Dùng **tên mới** (`map3.yaml` + `map3.pgm`). Không ghi đè `map2*` hay `map_fix.pgm`.
   - Ghi POI lại trên map mới; POI của map2 không dùng được trên map khác.
   - Thêm một dòng vào bảng trên, ghi bag/phiên làm bằng chứng.
3. Khi đổi map của baseline: tạo baseline mới (tài liệu và tag mới). Không sửa tài liệu baseline cũ.
