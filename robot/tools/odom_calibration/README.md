# odom_calibration: đo hệ số quãng đường odometry (Localization V2)

`odom_calib.py` **chỉ đọc**: không publish gì, không điều khiển robot. Người vận
hành tự lái robot bằng teleop. Script ghi `wheel/odom` và khoảng cách LiDAR tới
tường phía trước ở vạch đầu và vạch cuối, rồi tính:

- `scale_tape = quãng đường thước / quãng đường odom`;
- `scale_lidar = độ thay đổi khoảng cách LiDAR tới tường / quãng đường odom`, là
  tham chiếu độc lập thứ hai khi có tường thẳng phía trước.

```bash
python3 odom_calib.py start  fwd1              # robot đứng yên ở vạch đầu
python3 odom_calib.py end    fwd1 --tape 10.000
python3 odom_calib.py summary                  # >= 6 lượt sạch -> odom_linear_scale
```

Kết quả nằm ở `~/amr_logs/odom_calibration/` (đổi bằng `ODOM_CALIB_DIR`). Quy trình
đầy đủ, tiêu chí chấp nhận và cách dùng kết quả:
`robot/docs/localization-v2.md`. Test: `python3 -m pytest test_odom_calib.py`.
