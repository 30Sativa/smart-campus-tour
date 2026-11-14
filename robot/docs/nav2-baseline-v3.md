# Nav2 Baseline V3: không có hai nguồn lệnh chuyển động (2026-11-14)

**Mức:** development baseline, opt-in qua profile `NAV2_PARAMS=nav2_params_v3.yaml`.
- Mặc định của launcher vẫn là V2.
- **Chưa kiểm trên robot thật.** Mục 5 là cách nghiệm thu.
- V2 giữ nguyên và bị khoá bằng hash (`nav2-baseline-v2.md`), dùng để đối chứng và rollback.

## 1. Định nghĩa

| Thành phần | V2 | **V3** |
|---|---|---|
| File | `robot_control/config/nav2_params_v2.yaml` | `robot_control/config/nav2_params_v3.yaml` |
| `bt_navigator.default_server_timeout` | 20 ms (mặc định Humble) | **200 ms** |
| Cây BT | `navigate_*_no_backup.xml` | **`navigate_*_v3.xml`**: cây cũ cộng hai chốt huỷ |
| Mọi tham số khác | — | **giống hệt V2** (test kiểm từng khoá) |

Hai chốt huỷ trong cây V3, chỉ dùng node có sẵn của Nav2 Humble và BT.CPP 3.8:

```
NavigateRecovery
├─ Sequence: CancelSpin → NavigateWithReplanning (không đổi)
└─ RecoveryFallback → RoundRobin
     ├─ ClearingActions (không đổi)
     ├─ Sequence: CancelControl → Delay 500 ms → CancelControl → Delay 200 ms → Spin
     └─ Wait (không đổi)
```

## 2. Lỗi gốc (đã chứng minh)

Lỗi nằm trong `bt_action_node.hpp` của Nav2 Humble đã cài:
- BT gửi goal rồi chờ server xác nhận (ack) trong `server_timeout`. Quá hạn thì nó reset future và trả FAILURE, **không huỷ goal**.
- Vì chưa từng nhận được goal handle, `halt()` cũng không huỷ được.
- Server vẫn nhận goal muộn và chạy nó: goal **mồ côi**.

Chuyện này đã xảy ra trên robot:
- **14/11, lượt 15:04:**
  - giây 186.5: FollowPath bị timeout;
  - BT chạy Spin, trong khi controller vẫn chạy FollowPath mồ côi;
  - trong **10 s**, `cmd_vel_ctrl` xen kẽ (0.20, −0.01) và (0, 0.45);
  - robot gần như đứng yên, Spin thất bại, mất 15 s.
- **14/11, 15:22–15:35** (load 26): timeout xảy ra ở mọi action và service. Có cả Spin mồ côi.
- **Lượt sạch 15:43** (165 s, 0 recovery): không có timeout nào.

Ack chậm là do CPU tranh chấp. 20 ms quá chặt cho J5005 khi đang chạy cả Nav2, AMCL, camera và fleet.

## 3. Vì sao chọn cách này

- **200 ms** giảm mạnh xác suất có goal mồ côi. Ack chậm hơn 200 ms chỉ xảy ra khi máy quá tải nặng. Cái giá: BT phát hiện server chết chậm hơn tối đa 180 ms. Lúc chờ ack BT trả RUNNING, không ảnh hưởng chuyển động.
- **Chốt huỷ** bảo đảm không có hai nguồn lệnh, kể cả khi vẫn có goal mồ côi:
  - `CancelControl` và `CancelSpin` dùng `cancel_goals_before(now − 10 ms)`, không cần goal handle, nên huỷ được cả goal mồ côi.
  - Chỉ chốt trước **Spin** (recovery duy nhất làm robot chuyển động) và trước khi **chạy lại FollowPath**. Clear và Wait không làm robot chuyển động.
- **Delay 500 ms và lần `CancelControl` thứ hai:** offline, khi một lần huỷ là chưa đủ, lần thử FollowPath cuối được controller nhận khoảng 50 ms *sau* lần huỷ đầu và chạy song song với Spin.
- **Delay 200 ms trước Spin:** offline, controller log "Goal was canceled" 10–80 ms *sau* khi lệnh huỷ đã được chấp nhận (vòng điều khiển 10 Hz).
- **Không xác nhận được việc huỷ** trong `server_timeout` thì chốt báo FAILURE. Spin không chạy; RoundRobin chuyển sang Wait.

## 4. Kiểm thử offline

| Kiểm thử | Kết quả |
|---|---|
| `robot_control/test/test_nav2_baseline_v3_contract.py` | Hash V3; V3 khác V2 đúng 3 khoá; cây V3 bỏ chốt đi thì giống hệt cây `no_backup`; chốt nằm đúng chỗ, delay 500/200 ms; không có BackUp; `CancelControl` và `CancelSpin` có trong plugin Nav2 đã cài |
| `robot/tools/nav2_bench/sim/bt_orphan_check.py`: Nav2 thật + fakebot2, domain 86, ép FollowPath ack timeout (`server_timeout="1"` trong bản tạm), 90 s | **V2:** 3 đợt chồng lệnh, tổng 21.9 s, 3 Spin. **V3:** 0 đợt chồng lệnh, 0 lệnh controller trong lúc Spin; 14 lần timeout, 2 Spin hoàn tất trong khoảng 4.2 s; controller dừng 180–200 ms trước khi Spin bắt đầu |
| Cùng công cụ, không ép, START → POI_01 | **V3:** tới đích sau 78.9 s, 0 timeout, 0 Spin. **V2:** tới đích sau 88.5 s; tự nhiên bị 1 timeout ở giây 23.2, kéo theo Spin với 23 lệnh controller chạy chồng |

Lặp lại:

```bash
robot/tools/nav2_bench/sim/bt_orphan_check.py --params nav2_params_v2.yaml
```
```bash
robot/tools/nav2_bench/sim/bt_orphan_check.py --params nav2_params_v3.yaml
```

Chỉ chạy khi robot **không** điều hướng: bộ mô phỏng là cả một stack Nav2, ngốn CPU.

## 5. Nghiệm thu trên robot

1. Stage runtime có V3. Trong profile thử đặt
   `NAV2_PARAMS=<runtime>/install/robot_control/share/robot_control/config/nav2_params_v3.yaml`
   (đường dẫn tuyệt đối). Camera **tắt**, để chỉ có một thay đổi.
2. Chạy `run_route.sh` START → POI_01 → START hai lần.
   - Đạt: cả hai lượt hoàn tất, thời gian và số recovery không tệ hơn mốc 165 s / 0 recovery.
   - Log không có `Timed out while waiting`.
3. Trong bag (`/rosout`, `cmd_vel_ctrl`): nếu có Spin thì phải có
   `Goal was canceled` của controller **trước** `Running spin`, và không có lệnh v > 0.02 trong lúc Spin.

**Rollback:** đặt lại `NAV2_PARAMS=nav2_params_v2.yaml` rồi chạy lại `robot nav`.
