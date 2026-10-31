/**
 * Test host (gcc) cho logic tu phuc hoi BNO08x (imu/bno08x_rearm.c).
 * Chay: ./scripts/verify.sh
 */
#include "imu/bno08x_rearm.h"

#include <stdio.h>

static int g_fail = 0;

#define CHECK(cond, msg)                                                       \
    do {                                                                       \
        if (cond) { printf("  ok   %s\n", (msg)); }                            \
        else      { printf("  FAIL %s   (%s:%d)\n", (msg), __FILE__, __LINE__); g_fail++; } \
    } while (0)

#define STALE BNO08X_REARM_STALE_MS
#define GAP   BNO08X_REARM_MIN_INTERVAL_MS

static void test_healthy_stream_never_rearms(void)
{
    bno08x_rearm_t w;
    bno08x_rearm_note_request(&w, 0U);
    int n = 0;
    /* mau moi 50 ms suot 60 s */
    for (uint32_t t = 0U; t < 60000U; t += 10U)
        n += bno08x_rearm_due(&w, t, 1U, t - (t % 50U));
    CHECK(n == 0, "luong mau deu: khong bao gio gui lai");
}

static void test_stale_rearms_once_per_interval(void)
{
    bno08x_rearm_t w;
    bno08x_rearm_note_request(&w, 0U);
    uint32_t last_sample = 1000U;               /* mau cuoi luc 1 s, sau do im */
    int n = 0;
    uint32_t first = 0U;
    for (uint32_t t = 1000U; t <= 11000U; t += 10U)
    {
        if (bno08x_rearm_due(&w, t, 1U, last_sample))
        {
            if (n == 0) first = t;
            n++;
        }
    }
    CHECK(first == 2000U, "lan dau: sau MIN_INTERVAL ke tu lan request luc boot (stale tu 1.5 s)");
    CHECK(n == 5, "10 s im lang: 5 lan, cach nhau MIN_INTERVAL (2,4,6,8,10 s)");
}

static void test_stale_threshold(void)
{
    bno08x_rearm_t w;
    bno08x_rearm_note_request(&w, 0U);
    CHECK(bno08x_rearm_due(&w, 10000U, 1U, 10000U - STALE + 1U) == 0U, "mau cu hon STALE-1 ms: chua gui");
    CHECK(bno08x_rearm_due(&w, 10000U, 1U, 10000U - STALE) == 1U, "mau cu dung STALE ms: gui");
}

static void test_no_sample_since_boot(void)
{
    bno08x_rearm_t w;
    bno08x_rearm_note_request(&w, 100U);        /* Set Feature luc boot */
    CHECK(bno08x_rearm_due(&w, 100U + GAP - 1U, 0U, 0U) == 0U, "chua co mau: cho het MIN_INTERVAL sau lan boot");
    CHECK(bno08x_rearm_due(&w, 100U + GAP, 0U, 0U) == 1U, "chua co mau sau MIN_INTERVAL: gui lai");
}

static void test_fresh_samples_never_rearm_even_late(void)
{
    bno08x_rearm_t w;
    bno08x_rearm_note_request(&w, 0U);
    /* Goi reset sau cap nguon khong con la dieu kien: mau con moi thi khong gui. */
    CHECK(bno08x_rearm_due(&w, 5000U, 1U, 4990U) == 0U, "mau moi 10 ms: khong gui du da lau sau request");
}

static void test_external_request_resets_interval(void)
{
    bno08x_rearm_t w;
    bno08x_rearm_note_request(&w, 0U);
    bno08x_rearm_note_request(&w, 9000U);       /* DIAG vua bat lai feature */
    CHECK(bno08x_rearm_due(&w, 9500U, 1U, 1000U) == 0U, "sau DIAG: khong gui chong trong MIN_INTERVAL");
    CHECK(bno08x_rearm_due(&w, 9000U + GAP, 1U, 1000U) == 1U, "DIAG khong phuc hoi duoc: tu dong thu lai sau MIN_INTERVAL");
}

static void test_tick_wraparound(void)
{
    bno08x_rearm_t w;
    uint32_t base = 0xFFFFFFFFU - 1000U;
    bno08x_rearm_note_request(&w, base);
    uint32_t now = base + GAP;                  /* da tran qua 0 */
    CHECK(bno08x_rearm_due(&w, now, 1U, base + 100U) == 1U, "HAL_GetTick tran: van tinh dung khoang thoi gian");
    CHECK(bno08x_rearm_due(&w, now + 1U, 1U, now) == 0U, "sau tran: mau moi thi khong gui");
}

static void test_null_safe(void)
{
    bno08x_rearm_note_request(NULL, 0U);
    CHECK(bno08x_rearm_due(NULL, 99999U, 0U, 0U) == 0U, "NULL: khong crash, khong gui");
}

int main(void)
{
    printf("[bno08x_rearm]\n");
    test_healthy_stream_never_rearms();
    test_stale_rearms_once_per_interval();
    test_stale_threshold();
    test_no_sample_since_boot();
    test_fresh_samples_never_rearm_even_late();
    test_external_request_resets_interval();
    test_tick_wraparound();
    test_null_safe();
    if (g_fail) { printf("FAILED: %d\n", g_fail); return 1; }
    printf("all ok\n");
    return 0;
}
