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
 * mat hang tram ms va chan vong lap chinh. Mot lan ghi Set Feature la mot
 * giao dich I2C ~21 byte (~7 ms o bus bit-bang hien tai, toi da ~50 ms neu
 * bus bi giu -- cung bac voi doc ma vong lap da lam moi chu ky).
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
