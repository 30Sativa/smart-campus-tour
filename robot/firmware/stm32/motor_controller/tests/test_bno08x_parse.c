/**
 * Test host (gcc) cho logic parse SHTP + quaternion cua driver BNO08x.
 * Chay: ./scripts/verify.sh
 */
#include "imu/bno08x_parse.h"

#include <stdio.h>
#include <string.h>
#include <math.h>

static int g_fail = 0;

#define CHECK(cond, msg)                                                       \
    do {                                                                       \
        if (cond) { printf("  ok   %s\n", (msg)); }                            \
        else      { printf("  FAIL %s   (%s:%d)\n", (msg), __FILE__, __LINE__); g_fail++; } \
    } while (0)

#define CHECK_NEAR(got, want, tol, msg)                                        \
    do {                                                                       \
        double _g = (got), _w = (want);                                        \
        if (fabs(_g - _w) <= (tol)) { printf("  ok   %s (%.3f)\n", (msg), _g); }\
        else { printf("  FAIL %s: got %.3f want %.3f (%s:%d)\n",               \
                      (msg), _g, _w, __FILE__, __LINE__); g_fail++; }          \
    } while (0)

/* 0x7071 ~ 0.7071 o Q14 -> quay 90 do quanh truc Z */
#define Q14_90DEG 11585

/* Dung mot rotation-vector report (14 byte) voi quaternion cho truoc. */
static void make_rv(uint8_t *out, int16_t i, int16_t j, int16_t k, int16_t r)
{
    out[0] = 0x05;              /* report ID          */
    out[1] = 0x00;              /* sequence           */
    out[2] = 0x03;              /* status (accuracy)  */
    out[3] = 0x00;              /* delay              */
    out[4] = (uint8_t)(i & 0xFF); out[5]  = (uint8_t)((i >> 8) & 0xFF);
    out[6] = (uint8_t)(j & 0xFF); out[7]  = (uint8_t)((j >> 8) & 0xFF);
    out[8] = (uint8_t)(k & 0xFF); out[9]  = (uint8_t)((k >> 8) & 0xFF);
    out[10]= (uint8_t)(r & 0xFF); out[11] = (uint8_t)((r >> 8) & 0xFF);
    out[12]= 0x00; out[13] = 0x00;  /* accuracy est */
}

static void test_find_basic(void)
{
    printf("test_find_basic\n");
    uint8_t pl[19];
    /* base timestamp 5 byte */
    pl[0] = 0xFB; pl[1] = 0x11; pl[2] = 0x22; pl[3] = 0x33; pl[4] = 0x44;
    make_rv(pl + 5, 0, 0, Q14_90DEG, Q14_90DEG);

    const uint8_t *r = bno08x_find_report(pl, (int)sizeof(pl), 0x05);
    CHECK(r == pl + 5, "tim thay rotation vector sau base timestamp");
}

static void test_find_khong_nham_byte_du_lieu(void)
{
    printf("test_find_khong_nham_byte_du_lieu\n");
    uint8_t pl[19];
    /* base timestamp co byte delta = 0x05: cach quet byte cu se nham o day */
    pl[0] = 0xFB; pl[1] = 0x05; pl[2] = 0x05; pl[3] = 0x05; pl[4] = 0x05;
    make_rv(pl + 5, 0, 0, Q14_90DEG, Q14_90DEG);

    const uint8_t *r = bno08x_find_report(pl, (int)sizeof(pl), 0x05);
    CHECK(r == pl + 5, "bo qua byte 0x05 nam trong timestamp");
    CHECK(r != pl + 1, "khong tra ve vi tri nham cua cach quet byte");
}

static void test_khong_co_report_mong_muon(void)
{
    printf("test_khong_co_report_mong_muon\n");
    uint8_t pl[17];
    pl[0] = 0xFB; pl[1] = 0; pl[2] = 0; pl[3] = 0; pl[4] = 0;
    /* game rotation vector 12 byte, co byte du lieu = 0x05 */
    memset(pl + 5, 0, 12);
    pl[5] = 0x08; pl[9] = 0x05; pl[11] = 0x05;

    CHECK(bno08x_find_report(pl, (int)sizeof(pl), 0x05) == NULL,
          "khong nham game rotation vector thanh rotation vector");
    CHECK(bno08x_find_report(pl, (int)sizeof(pl), 0x08) == pl + 5,
          "van tim dung game rotation vector");
}

static void test_report_la_va_cat_cut(void)
{
    printf("test_report_la_va_cat_cut\n");
    uint8_t la[6] = {0x77, 0, 0, 0, 0, 0};
    CHECK(bno08x_find_report(la, (int)sizeof(la), 0x05) == NULL,
          "report ID la -> bo goi thay vi doan bua");

    uint8_t cut[15];
    cut[0] = 0xFB; cut[1] = 0; cut[2] = 0; cut[3] = 0; cut[4] = 0;
    make_rv(cut + 5, 0, 0, Q14_90DEG, Q14_90DEG);
    /* chi con 10/14 byte cua RV */
    CHECK(bno08x_find_report(cut, 5 + 9, 0x05) == NULL,
          "rotation vector bi cat cut -> khong nhan");

    CHECK(bno08x_find_report(NULL, 10, 0x05) == NULL, "payload NULL -> NULL");
    CHECK(bno08x_find_report(cut, 0, 0x05) == NULL, "payload rong -> NULL");
}

static void test_quat_to_euler(void)
{
    printf("test_quat_to_euler\n");
    float yaw, pitch, roll;

    bno08x_quat_to_euler(0.0f, 0.0f, 0.0f, 1.0f, &yaw, &pitch, &roll);
    CHECK_NEAR(yaw, 0.0, 0.01, "quaternion don vi -> yaw 0");
    CHECK_NEAR(pitch, 0.0, 0.01, "quaternion don vi -> pitch 0");
    CHECK_NEAR(roll, 0.0, 0.01, "quaternion don vi -> roll 0");

    float s = (float)Q14_90DEG / 16384.0f;
    bno08x_quat_to_euler(0.0f, 0.0f, s, s, &yaw, &pitch, &roll);
    CHECK_NEAR(yaw, 90.0, 0.2, "quay 90 do quanh Z -> yaw 90");

    bno08x_quat_to_euler(s, 0.0f, 0.0f, s, &yaw, &pitch, &roll);
    CHECK_NEAR(roll, 90.0, 0.2, "quay 90 do quanh X -> roll 90");
}

static void test_wrap180(void)
{
    printf("test_wrap180\n");
    CHECK_NEAR(bno08x_wrap180(0.0f), 0.0, 1e-4, "0 -> 0");
    CHECK_NEAR(bno08x_wrap180(190.0f), -170.0, 1e-4, "190 -> -170");
    CHECK_NEAR(bno08x_wrap180(-190.0f), 170.0, 1e-4, "-190 -> 170");
    CHECK_NEAR(bno08x_wrap180(540.0f), 180.0, 1e-4, "540 -> 180");
    CHECK_NEAR(bno08x_wrap180(-180.0f), 180.0, 1e-4, "-180 -> 180 (bien)");
}

/* Mo phong dung cong thuc driver dung: reported = wrap180(raw - offset) */
static float reported(float raw, float offset) { return bno08x_wrap180(raw - offset); }

static void test_tare(void)
{
    printf("test_tare\n");
    const float raws[]    = {0.0f, 170.0f, -170.0f, 10.0f, 179.9f, -45.0f};
    const float targets[] = {0.0f, 0.0f, 0.0f, -175.0f, 90.0f, 180.0f};

    for (unsigned i = 0; i < sizeof(raws) / sizeof(raws[0]); i++)
    {
        float off = bno08x_tare_offset(raws[i], targets[i]);
        char msg[96];
        snprintf(msg, sizeof(msg), "raw=%.1f dat ve %.1f", raws[i], targets[i]);
        CHECK_NEAR(reported(raws[i], off), bno08x_wrap180(targets[i]), 0.01, msg);
    }

    /* Sau khi tare ve 0, quay them 30 do thi bao 30 do. */
    float off = bno08x_tare_offset(170.0f, 0.0f);
    CHECK_NEAR(reported(bno08x_wrap180(170.0f + 30.0f), off), 30.0, 0.01,
               "tare ve 0 roi quay them 30 do");

    /* Offset = 0 tuc la yaw tho. */
    CHECK_NEAR(reported(123.0f, 0.0f), 123.0, 0.01, "offset 0 -> yaw tho");
}

static void test_build_set_feature(void)
{
    printf("test_build_set_feature\n");
    uint8_t pkt[BNO08X_SET_FEATURE_LEN];

    /* co tinh do rac vao truoc, de bat loi quen gan mot byte nao do */
    memset(pkt, 0xAA, sizeof(pkt));

    uint16_t len = bno08x_build_set_feature(pkt, 7, 0x05, 20000);

    CHECK(len == 21, "do dai goi = 21 byte");
    CHECK((pkt[0] | (pkt[1] << 8)) == 21, "header mang dung do dai");
    CHECK(pkt[2] == 2, "pkt[2] = channel 2 (control)  <-- bug cu de sot byte nay");
    CHECK(pkt[3] == 7, "sequence number");
    CHECK(pkt[4] == 0xFD, "report ID = SET_FEATURE_COMMAND");
    CHECK(pkt[5] == 0x05, "feature = rotation vector");
    CHECK(pkt[6] == 0 && pkt[7] == 0 && pkt[8] == 0, "flags + sensitivity = 0");

    uint32_t iv = (uint32_t)pkt[9] | ((uint32_t)pkt[10] << 8) |
                  ((uint32_t)pkt[11] << 16) | ((uint32_t)pkt[12] << 24);
    CHECK(iv == 20000, "interval 20000us, little-endian");

    int tail_zero = 1;
    for (int i = 13; i < 21; i++) { if (pkt[i] != 0) tail_zero = 0; }
    CHECK(tail_zero, "pkt[13..20] duoc xoa sach, khong con rac stack");

    CHECK(bno08x_build_set_feature(NULL, 0, 0x05, 20000) == 0, "pkt NULL -> 0");
}

static void test_find_report_last(void)
{
    printf("test_find_report_last\n");
    /* goi gom: timestamp + 3 rotation vector (giong PKT=65 tren board) */
    uint8_t pl[5 + 14 * 3];
    pl[0] = 0xFB; pl[1] = 0; pl[2] = 0; pl[3] = 0; pl[4] = 0;
    make_rv(pl + 5,           100, 0, 0, Q14_90DEG);
    make_rv(pl + 5 + 14,      200, 0, 0, Q14_90DEG);
    make_rv(pl + 5 + 14 * 2,  300, 0, 0, Q14_90DEG);

    const uint8_t *first = bno08x_find_report(pl, (int)sizeof(pl), 0x05);
    const uint8_t *last  = bno08x_find_report_last(pl, (int)sizeof(pl), 0x05);

    CHECK(first == pl + 5, "find_report lay mau dau (cu nhat)");
    CHECK(last == pl + 5 + 14 * 2, "find_report_last lay mau cuoi (moi nhat)");
    CHECK((last[4] | (last[5] << 8)) == 300, "du lieu dung cua mau cuoi");

    /* mot mau duy nhat -> hai ham phai tra ve cung cho */
    uint8_t one[5 + 14];
    one[0] = 0xFB; one[1] = 0; one[2] = 0; one[3] = 0; one[4] = 0;
    make_rv(one + 5, 42, 0, 0, Q14_90DEG);
    CHECK(bno08x_find_report_last(one, (int)sizeof(one), 0x05) == one + 5,
          "mot mau -> giong find_report");
    CHECK(bno08x_find_report_last(one, (int)sizeof(one), 0x09) == NULL,
          "khong co report mong muon -> NULL");
}

static void test_count_reports(void)
{
    printf("test_count_reports\n");
    uint8_t pl[5 + 14 * 3];
    pl[0] = 0xFB; pl[1] = 0; pl[2] = 0; pl[3] = 0; pl[4] = 0;
    make_rv(pl + 5,          1, 0, 0, Q14_90DEG);
    make_rv(pl + 5 + 14,     2, 0, 0, Q14_90DEG);
    make_rv(pl + 5 + 14 * 2, 3, 0, 0, Q14_90DEG);

    CHECK(bno08x_count_reports(pl, (int)sizeof(pl), 0x05) == 3, "dem duoc 3 report");
    CHECK(bno08x_count_reports(pl, (int)sizeof(pl), 0xFB) == 1, "dem duoc 1 timestamp");
    CHECK(bno08x_count_reports(pl, (int)sizeof(pl), 0x08) == 0, "khong co game RV -> 0");
    CHECK(bno08x_count_reports(NULL, 10, 0x05) == 0, "NULL -> 0");
}

static void test_report_accuracy(void)
{
    printf("test_report_accuracy\n");
    uint8_t rv[14];
    make_rv(rv, 0, 0, Q14_90DEG, Q14_90DEG);

    for (uint8_t acc = 0; acc <= 3; acc++)
    {
        rv[2] = acc;
        char msg[64];
        snprintf(msg, sizeof(msg), "status=%u -> accuracy %u", acc, acc);
        CHECK(bno08x_report_accuracy(rv) == acc, msg);
    }

    rv[2] = 0xFC;   /* chi 2 bit thap la accuracy */
    CHECK(bno08x_report_accuracy(rv) == 0, "bit cao khong lot vao accuracy");
    rv[2] = 0xFF;
    CHECK(bno08x_report_accuracy(rv) == 3, "0xFF -> accuracy 3");
    CHECK(bno08x_report_accuracy(NULL) == 0, "NULL -> 0");
}

static void test_yaw_offset_quat(void)
{
    printf("test_yaw_offset_quat\n");
    /* Quaternion sau khi ap offset phai cho ra dung yaw da tare:
     * yaw_sau = wrap180(yaw_truoc - offset) */
    const float raws[]    = {0.0f, 45.0f, 170.0f, -120.0f, 90.0f};
    const float offsets[] = {0.0f, 90.0f, 170.0f,   45.0f, -90.0f};

    for (unsigned n = 0; n < sizeof(raws) / sizeof(raws[0]); n++)
    {
        /* dung quaternion thuan yaw = raws[n] */
        float half = raws[n] * 0.01745329252f * 0.5f;
        float qi = 0.0f, qj = 0.0f, qk = sinf(half), qr = cosf(half);

        bno08x_apply_yaw_offset_quat(&qi, &qj, &qk, &qr, offsets[n]);

        float yaw;
        bno08x_quat_to_euler(qi, qj, qk, qr, &yaw, NULL, NULL);

        char msg[80];
        snprintf(msg, sizeof(msg), "yaw %.0f, offset %.0f", raws[n], offsets[n]);
        CHECK_NEAR(yaw, bno08x_wrap180(raws[n] - offsets[n]), 0.05, msg);
    }

    /* offset 0 khong duoc doi gi */
    float qi = 0.1f, qj = 0.2f, qk = 0.3f, qr = 0.927f;
    float i0 = qi, j0 = qj, k0 = qk, r0 = qr;
    bno08x_apply_yaw_offset_quat(&qi, &qj, &qk, &qr, 0.0f);
    CHECK(fabsf(qi - i0) < 1e-5f && fabsf(qj - j0) < 1e-5f &&
          fabsf(qk - k0) < 1e-5f && fabsf(qr - r0) < 1e-5f,
          "offset 0 -> quaternion khong doi");

    bno08x_apply_yaw_offset_quat(NULL, &qj, &qk, &qr, 90.0f);   /* khong duoc crash */
    CHECK(1, "con tro NULL -> khong lam gi");
}

static void test_report_len(void)
{
    printf("test_report_len\n");
    CHECK(bno08x_report_len(0xFB) == 5,  "base timestamp = 5 byte");
    CHECK(bno08x_report_len(0x05) == 14, "rotation vector = 14 byte");
    CHECK(bno08x_report_len(0x08) == 12, "game rotation vector = 12 byte");
    CHECK(bno08x_report_len(0x01) == 10, "accelerometer = 10 byte");
    CHECK(bno08x_report_len(0x77) == 0,  "report la = 0 (khong biet)");
}

int main(void)
{
    test_report_len();
    test_build_set_feature();
    test_find_basic();
    test_find_report_last();
    test_count_reports();
    test_report_accuracy();
    test_yaw_offset_quat();
    test_find_khong_nham_byte_du_lieu();
    test_khong_co_report_mong_muon();
    test_report_la_va_cat_cut();
    test_quat_to_euler();
    test_wrap180();
    test_tare();

    if (g_fail == 0) { printf("\nTAT CA TEST PASS\n"); return 0; }
    printf("\n%d TEST FAIL\n", g_fail);
    return 1;
}
