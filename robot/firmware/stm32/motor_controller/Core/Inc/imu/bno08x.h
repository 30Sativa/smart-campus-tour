/**
 ******************************************************************************
 * @file    bno08x.h
 * @brief   Driver BNO080/085/086 (GY-BNO080X) qua I2C bit-bang PB6/PB7.
 *
 * Wiring (board GY-BNO080X) -> STM32G431:
 *   VCC -> 3V3        GND -> GND
 *   SCL -> PB6        SDA -> PB7     (2 chan MCU duy nhat)
 *   ADD -> GND (0x4A) CS  -> 3V3     (BAT BUOC cao = che do I2C)
 *   PS1 -> GND        PS0 -> GND
 *   RST -> 3V3        INT -> bo trong
 *   BOOT-> VCC (keo cao, qua 10k neu co)
 *
 * Ghi chu: dung bit-bang de chiu duoc clock stretching cua BNO08x va tranh
 * dung cac chan dac biet nhu PF0-OSC_IN. Neu can RST/INT rieng, bat macro
 * BNO08X_USE_HW_RST/BNO08X_USE_INT_PIN trong bno08x.c.
 ******************************************************************************
 */
#ifndef IMU_BNO08X_H
#define IMU_BNO08X_H

#include <stdint.h>

/* ---- Ngan sach thoi gian cua main loop --------------------------------------
 *
 * App_Loop() la vong lap co-operative duy nhat: Motor_Update(), Protocol_Update()
 * (feedback + watchdog lenh 300 ms) va BNO08x_ReadRotationVector() dung chung
 * no. Doc I2C bit-bang la viec dat nhat trong vong, nen no PHAI co chan tren.
 *
 * So goi SHTP xu ly trong MOT lan goi ReadRotationVector.
 * Vi sao 1: bang thong bus la thu chan tren toc do tieu thu, KHONG phai so goi
 * moi vong -- doc N goi ton ~N lan thoi gian, nen so goi/giay gan nhu khong doi
 * du N la 1 hay 8. Tang N chi lam vong lap dai them (feedback cham di) ma khong
 * tieu thu IMU nhanh hon. Chon 1 = do tre main loop nho nhat, throughput y het.
 */
#ifndef BNO08X_MAX_PACKETS_PER_UPDATE
#define BNO08X_MAX_PACKETS_PER_UPDATE 1U
#endif

#if (BNO08X_MAX_PACKETS_PER_UPDATE < 1U) || (BNO08X_MAX_PACKETS_PER_UPDATE > 8U)
#error "BNO08X_MAX_PACKETS_PER_UPDATE phai nam trong [1, 8]"
#endif

/* Chu ky bao cao rotation vector (ms) = toc do PHAT cua BNO08x.
 * Phai khop voi toc do TIEU THU thuc te, neu khong FIFO trong BNO day len va
 * heading tre dan -- doc duoc bang truong PKT trong lenh DIAG.
 *
 * 50 ms (20 Hz) khop dung nhip FEEDBACK_PERIOD_MS = 20 ms: FB chi mang duoc
 * mau yaw MOI NHAT, nen phat nhanh hon 20 Hz chi dot bang thong bus chu khong
 * lam /odom chinh xac hon.
 *
 * Neu sau nay SYSCLK duoc dua len PLL (xem ghi chu trong bno08x.c) thi bus
 * nhanh len va co the ha lai ve 20 ms (50 Hz).
 */
#ifndef BNO08X_RV_INTERVAL_MS
#define BNO08X_RV_INTERVAL_MS 50U
#endif

typedef struct
{
    float yaw;     /* quay quanh Z (heading) */
    float pitch;   /* quay quanh Y */
    float roll;    /* quay quanh X */
} BNO08x_Euler;

void BNO08x_Init(void);
uint8_t BNO08x_SelfTest(uint8_t *sw_major, uint8_t *sw_minor);
uint8_t BNO08x_EnableRotationVector(uint16_t interval_ms);
uint8_t BNO08x_ReadRotationVector(float *qi, float *qj, float *qk, float *qr,
                                  BNO08x_Euler *euler);
float BNO08x_GetLastYaw(uint8_t *valid);

/* So mau rotation vector nhan duoc trong giay vua roi.  Ky vong ~1000 /
 * BNO08X_RV_INTERVAL_MS (= 20 voi 50 ms). Thap hon nhieu = dang mat mau /
 * doc khong kip. */
uint32_t BNO08x_GetSampleRate(void);

/* Muc tin cay cua mau gan nhat: 0 = tu ke chua hieu chuan, 3 = tot.
 * Heading van co gia tri khi accuracy = 0 nhung co the sai hang chuc do. */
uint8_t BNO08x_GetAccuracy(void);

/* Bo dem suc khoe bus. Tang len trong luc chay = bus dang co van de. */
uint32_t BNO08x_GetBusWarnCount(void);
uint32_t BNO08x_GetBusRecoverCount(void);

/* 0 = DWT CYCCNT khong chay, bb_delay dang dung duong du phong (bus se cham hon). */
uint8_t BNO08x_IsDwtOk(void);

/* Tare mem (chi anh huong yaw, khong ghi flash cua BNO08x).
 * SetYawDeg(0) = "huong dang quay mat vao la 0 do". */
void BNO08x_SetYawDeg(float yaw_deg);
void BNO08x_ClearYawOffset(void);
float BNO08x_GetYawOffset(void);

/* Chan doan bit-bang. 0=ACK, 1=NOACK. */
uint8_t BNO08x_Diag(void);

/* Muc dien ap khi tha 2 duong bus. Ca hai phai = 1 (co pull-up len 3V3).
 * =0 nghia la thieu pull-up, chap xuong GND, hoac chan bi cau hinh sai. */
void BNO08x_BusIdle(uint8_t *sda_high, uint8_t *scl_high);

/* Quet dia chi 0x08..0x77, ghi cac dia chi co ACK vao found[].
 * Tra ve tong so thiet bi tim thay. */
uint8_t BNO08x_ScanBus(uint8_t *found, uint8_t max_found);

/* Co pull-up NGOAI tren bus khong?
 * Tam doi 2 chan sang input + pull-down noi (~40k) roi doc.  Van ra muc cao
 * = co dien tro keo len 3V3 o ben ngoai => day thuc su noi toi module dang
 * co nguon.  Ra muc thap = day dut, module mat nguon, hoac thieu pull-up. */
void BNO08x_BusPullTest(uint8_t *sda_ext, uint8_t *scl_ext);

/* Do dai goi SHTP dang cho o dau hang doi (doc 4 byte header).
 * 0 = khong co du lieu, 0xFFFF = khong doc duoc. Chi dung de chan doan. */
uint16_t BNO08x_PeekPacketLen(uint8_t *channel);

/* Do tan so clock that su cua bit-bang (bit/giay) bang cach dap clock rong.
 * I2C standard mode = 100000. Thap hon nhieu thi bus khong tai noi 50Hz. */
uint32_t BNO08x_BusClockHz(void);

#endif /* IMU_BNO08X_H */
