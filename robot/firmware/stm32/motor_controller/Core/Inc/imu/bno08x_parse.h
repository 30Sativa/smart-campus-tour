/**
 ******************************************************************************
 * @file    bno08x_parse.h
 * @brief   Logic thuan (khong phu thuoc HAL) cua driver BNO08x:
 *          - do dai sensor report SHTP
 *          - duyet payload tuan tu de lay dung report
 *          - quaternion -> Euler, wrap goc
 *
 * Tach rieng ra header-only de compile & test duoc tren host bang gcc
 * (xem tests/test_bno08x_parse.c). bno08x.c include file nay.
 ******************************************************************************
 */
#ifndef IMU_BNO08X_PARSE_H
#define IMU_BNO08X_PARSE_H

#include <stdint.h>
#include <stddef.h>
#include <string.h>
#include <math.h>

/**
 * Do dai (byte) cua mot sensor report trong payload SHTP channel 3,
 * tinh ca byte report ID.
 * Tra 0 = report la -> khong biet nhay bao nhieu byte -> phai bo goi.
 */
static inline uint8_t bno08x_report_len(uint8_t id)
{
    switch (id)
    {
    case 0xFB: /* base timestamp      */
    case 0xFA: /* timestamp rebase    */ return 5U;
    case 0x01: /* accelerometer       */
    case 0x02: /* gyroscope calib     */
    case 0x03: /* magnetic field      */
    case 0x04: /* linear acceleration */
    case 0x06: /* gravity             */ return 10U;
    case 0x08: /* game rotation vec   */ return 12U;
    case 0x05: /* rotation vector     */
    case 0x09: /* geomagnetic rot vec */ return 14U;
    case 0x07: /* gyroscope uncalib   */
    case 0x0F: /* magnetic uncalib    */ return 16U;
    default:                             return 0U;
    }
}

/**
 * Duyet TUAN TU payload theo do dai tung report, tra ve con tro toi report
 * co ID = want. NULL neu khong co, hoac gap report la (khong ro do dai),
 * hoac report bi cat cut.
 *
 * Khac voi cach quet byte: mot byte du lieu tinh co bang want se khong
 * con bi nham la report ID.
 */
static inline const uint8_t *bno08x_find_report(const uint8_t *p, int n, uint8_t want)
{
    int i = 0;

    if ((p == NULL) || (n <= 0)) return NULL;

    while (i < n)
    {
        uint8_t len = bno08x_report_len(p[i]);
        if ((len == 0U) || ((i + (int)len) > n)) return NULL;
        if (p[i] == want) return &p[i];
        i += (int)len;
    }
    return NULL;
}

/**
 * Nhu bno08x_find_report nhung tra ve report CUOI CUNG khop trong payload.
 *
 * BNO08x gom nhieu report vao mot goi khi vong lap doc cham hon toc do sensor
 * (vd PKT=65 = 4 report rotation vector trong mot goi).  Lay cai moi nhat de
 * heading khong bi tre dan theo do sau cua hang doi.
 *
 * Gap report la giua chung thi dung lai va tra ve cai da tim duoc: cac offset
 * truoc do van duoc duyet dung theo bang do dai.
 */
static inline const uint8_t *bno08x_find_report_last(const uint8_t *p, int n, uint8_t want)
{
    const uint8_t *hit = NULL;
    int i = 0;

    if ((p == NULL) || (n <= 0)) return NULL;

    while (i < n)
    {
        uint8_t len = bno08x_report_len(p[i]);
        if ((len == 0U) || ((i + (int)len) > n)) break;
        if (p[i] == want) hit = &p[i];
        i += (int)len;
    }
    return hit;
}

/** Dem so report co ID = want trong payload. */
static inline int bno08x_count_reports(const uint8_t *p, int n, uint8_t want)
{
    int i = 0, cnt = 0;

    if ((p == NULL) || (n <= 0)) return 0;

    while (i < n)
    {
        uint8_t len = bno08x_report_len(p[i]);
        if ((len == 0U) || ((i + (int)len) > n)) break;
        if (p[i] == want) cnt++;
        i += (int)len;
    }
    return cnt;
}

/**
 * Muc tin cay cua mot report rotation vector (byte status, 2 bit thap).
 * 0 = chua hieu chuan / khong tin duoc, 3 = tot nhat.
 * Khi tu ke chua hieu chuan, BNO08x van tra heading nhung bao accuracy 0 --
 * so ra nhin hop ly ma co the sai hang chuc do.
 */
static inline uint8_t bno08x_report_accuracy(const uint8_t *rep)
{
    return (rep == NULL) ? 0U : (uint8_t)(rep[2] & 0x03U);
}

/**
 * Ap offset tare vao quaternion: xoay quanh truc Z mot goc -offset_deg,
 * de quaternion tra ve khop voi yaw da tare.
 *
 *   q_out = q_z(-offset) * q_in ,  q_z = (cos(h), 0, 0, sin(h)), h = -offset/2
 *
 * Khong lam viec nay thi yaw da tare va quaternion tho lech nhau -- bay cho
 * ai dung quaternion de dung sensor_msgs/Imu sau nay.
 */
static inline void bno08x_apply_yaw_offset_quat(float *qi, float *qj,
                                                float *qk, float *qr,
                                                float offset_deg)
{
    const float DEG2RAD = 0.01745329252f;
    float h, cz, sz, i, j, k, r;

    if ((qi == NULL) || (qj == NULL) || (qk == NULL) || (qr == NULL)) return;

    h  = -offset_deg * DEG2RAD * 0.5f;
    cz = cosf(h);
    sz = sinf(h);
    i = *qi; j = *qj; k = *qk; r = *qr;

    *qr = (cz * r) - (sz * k);
    *qi = (cz * i) - (sz * j);
    *qj = (cz * j) + (sz * i);
    *qk = (cz * k) + (sz * r);
}

/** Dua goc ve khoang (-180, 180] do. */
static inline float bno08x_wrap180(float deg)
{
    while (deg > 180.0f)   deg -= 360.0f;
    while (deg <= -180.0f) deg += 360.0f;
    return deg;
}

/** Quaternion (i, j, k, real) -> yaw/pitch/roll (do). Con tro NULL duoc bo qua. */
static inline void bno08x_quat_to_euler(float qi, float qj, float qk, float qr,
                                        float *yaw, float *pitch, float *roll)
{
    const float RAD2DEG = 57.2957795f;

    if (roll != NULL)
    {
        float sinr_cosp = 2.0f * ((qr * qi) + (qj * qk));
        float cosr_cosp = 1.0f - (2.0f * ((qi * qi) + (qj * qj)));
        *roll = atan2f(sinr_cosp, cosr_cosp) * RAD2DEG;
    }
    if (pitch != NULL)
    {
        float sinp = 2.0f * ((qr * qj) - (qk * qi));
        if (sinp > 1.0f)  sinp = 1.0f;
        if (sinp < -1.0f) sinp = -1.0f;
        *pitch = asinf(sinp) * RAD2DEG;
    }
    if (yaw != NULL)
    {
        float siny_cosp = 2.0f * ((qr * qk) + (qi * qj));
        float cosy_cosp = 1.0f - (2.0f * ((qj * qj) + (qk * qk)));
        *yaw = atan2f(siny_cosp, cosy_cosp) * RAD2DEG;
    }
}

/**
 * Tinh offset tare: sau khi dat offset nay, goc bao ve se dung bang target_deg
 * tai huong tho raw_deg hien tai.  reported = wrap180(raw - offset)
 */
static inline float bno08x_tare_offset(float raw_deg, float target_deg)
{
    return bno08x_wrap180(raw_deg - target_deg);
}

/* --- Dung goi SHTP --- */

#define BNO08X_SHTP_CH_CONTROL      2U
#define BNO08X_SET_FEATURE_COMMAND  0xFDU
#define BNO08X_SET_FEATURE_LEN      21U   /* 4 byte header + 17 byte payload */

/**
 * Dung goi Set Feature Command.  pkt phai co it nhat BNO08X_SET_FEATURE_LEN byte.
 * Tra ve do dai goi.
 *
 * Luu y: pkt[2] la byte CHANNEL cua SHTP.  Quen gan no (de nguyen rac tren
 * stack) thi chip nhan lenh o channel sai va lang le bo qua -- self-test van
 * OK nhung sensor khong bao gio stream.  Test khoa dieu nay lai.
 */
static inline uint16_t bno08x_build_set_feature(uint8_t *pkt, uint8_t seq,
                                                uint8_t report_id,
                                                uint32_t interval_us)
{
    if (pkt == NULL) return 0U;

    memset(pkt, 0, BNO08X_SET_FEATURE_LEN);
    pkt[0]  = (uint8_t)(BNO08X_SET_FEATURE_LEN & 0xFFU);
    pkt[1]  = (uint8_t)((BNO08X_SET_FEATURE_LEN >> 8) & 0xFFU);
    pkt[2]  = BNO08X_SHTP_CH_CONTROL;
    pkt[3]  = seq;
    pkt[4]  = BNO08X_SET_FEATURE_COMMAND;
    pkt[5]  = report_id;
    /* pkt[6] feature flags, pkt[7..8] change sensitivity: de 0 */
    pkt[9]  = (uint8_t)(interval_us & 0xFFU);
    pkt[10] = (uint8_t)((interval_us >> 8) & 0xFFU);
    pkt[11] = (uint8_t)((interval_us >> 16) & 0xFFU);
    pkt[12] = (uint8_t)((interval_us >> 24) & 0xFFU);
    /* pkt[13..20] batch interval + sensor-specific config: de 0 */
    return BNO08X_SET_FEATURE_LEN;
}

#endif /* IMU_BNO08X_PARSE_H */
