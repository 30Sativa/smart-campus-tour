#ifndef BNO08X_REARM_H
#define BNO08X_REARM_H

/*
 * Quyet dinh khi nao gui lai Set Feature cho BNO08x (logic thuan, test duoc
 * tren host: tests/test_bno08x_rearm.c).
 *
 * Van de: firmware chi bat orientation report mot lan luc boot. BNO08x tu
 * reset (SH-2: sau reset moi feature deu tat) hoac bus bi giu -> chip im lang
 * vinh vien, yaw_valid = 0 cho toi khi reset STM32. Do tren robot 19/10/2026:
 * DIAG truoc reset bao ACK, SCAN=4A, RV_NONE, PKT=0; chi can bat lai feature
 * la co mau tro lai.
 *
 * Cach sua: neu khong co mau qua BNO08X_REARM_STALE_MS, gui lai Set Feature.
 * Goi "reset complete" cua SH-2 chi duoc DEM (bang chung), khong dung de kich
 * hoat: goi do cung den sau moi lan cap nguon, dung no thi luc boot khoe manh
 * cung ra mot lan rearm, bo dem mat y nghia; sau reset that chip im lang nen
 * dieu kien stale bat duoc trong 500 ms. Toi da mot lan moi
 * BNO08X_REARM_MIN_INTERVAL_MS. Chi gui lai feature, KHONG reset chip: reset
 * mat hang tram ms va chan vong lap chinh. Mot lan ghi Set Feature la 22 byte
 * I2C = 198 clock, ~6.7 ms o bus do duoc 29.5 kHz (DIAG CLK=29500, 19/10) --
 * it hon mot lan doc report binh thuong (~9 ms), va khi chip im lang moi vong
 * chi doc header 4 byte (~1.7 ms). Bus bi giu: that bai sau mot lan timeout
 * stretch 25 ms. Gioi han chung cua driver bit-bang (khong do thay doi nay):
 * slave stretch moi bit sat 25 ms co the keo dai BAT KY giao dich nao; khi do
 * watchdog ISR 500 ms (MOTOR_ISR_WATCHDOG_MS) van dung xung dong co.
 */

#include <stdint.h>

#ifndef BNO08X_REARM_STALE_MS
#define BNO08X_REARM_STALE_MS 500U
#endif

#ifndef BNO08X_REARM_MIN_INTERVAL_MS
#define BNO08X_REARM_MIN_INTERVAL_MS 2000U
#endif

typedef struct
{
    uint32_t last_request_ms; /* lan cuoi gui Set Feature (ke ca luc boot) */
} bno08x_rearm_t;

/* Ghi nhan mot lan gui Set Feature (boot, DIAG, hay tu dong). */
void bno08x_rearm_note_request(bno08x_rearm_t *w, uint32_t now_ms);

/* 1 = nen gui lai Set Feature ngay bay gio (va da ghi nhan lan gui).
 * have_sample: da tung co mau tu lan khoi dong; last_sample_ms chi co nghia
 * khi have_sample = 1.
 * Moi phep tru thoi gian dung uint32_t nen dung qua moc tran HAL_GetTick(). */
uint8_t bno08x_rearm_due(bno08x_rearm_t *w, uint32_t now_ms,
                         uint8_t have_sample, uint32_t last_sample_ms);

#endif
