# Mô hình đầu + kính Meta Quest 3

SolidWorks part của cụm đầu trên robot (`A_Full_Xe`) và kính Meta Quest 3 đeo trên đó.

| File | Nội dung |
|---|---|
| `Dau.SLDPRT` | Mô hình đầu người (low-poly), trục Y hướng lên, mặt hướng +Z, đơn vị mm. |
| `Quest3.SLDPRT` | Kính Meta Quest 3 kèm quai, cùng hệ trục với `Dau.SLDPRT`. |

## Vị trí đeo kính

Trong hệ toạ độ của `Dau.SLDPRT`, kính đặt **không xoay**, dịch **+160 mm theo Y** và **+14 mm theo Z**:

- tâm thấu kính ngang tầm mắt (Y ≈ 128 mm),
- thân kính và quai không cắt vào đầu,
- đệm mặt cách mặt 4–25 mm (đầu low-poly, đệm thật bị nén).

Lắp trong SolidWorks bằng 3 mate giữa mặt phẳng gốc của hai part:
Right Plane trùng nhau, Top Plane cách 160 mm, Front Plane cách 14 mm.

Trong `A_Full_Xe`, cụm đầu nằm ở component `Assem2s-1/Dau-1`; kính đi theo đúng placement
của component đó. Mô hình web ở mục 04 / Công nghệ (`web/public/models/robot/campus-amr-explode.glb`)
được dựng theo cách này, xem `web/scripts/build-robot-explode-glb.py`.
