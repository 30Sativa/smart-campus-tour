/**
 * Host test (gcc) for Core/Src/usb_protocol.c with HAL/USB/motor/IMU stubbed:
 *  - an accepted CMD re-arms the ISR watchdog BEFORE setting wheel speeds
 *  - the main-loop CMD timeout (CMD_TIMEOUT_MS) stops the motors
 *  - a pending ERR,bad_command no longer suppresses FB frames
 * Run: ./scripts/verify.sh
 */
#include "usb_protocol.h"
#include "motor/motor.h"
#include "usbd_cdc_if.h"
#include "imu/bno08x.h"
#include "sonar/sr04t.h"
#include "contactor/contactor.h"

#include <stdio.h>
#include <string.h>

static int g_fail = 0;
int g_irq_disabled = 0;
#define CHECK(cond, msg)                                                       \
    do {                                                                       \
        if (cond) { printf("  ok   %s\n", (msg)); }                            \
        else      { printf("  FAIL %s   (%s:%d)\n", (msg), __FILE__, __LINE__); g_fail++; } \
    } while (0)

/* ---- stubs ------------------------------------------------------------ */
static uint32_t g_now = 1000U;
uint32_t SystemCoreClock = 16000000U;
uint32_t HAL_GetTick(void) { return g_now; }
void HAL_Delay(uint32_t ms) { g_now += ms; }

static char g_log[64][32];   /* motor call order */
static int g_nlog = 0;
static void logc(const char *s) { if (g_nlog < 64) { strncpy(g_log[g_nlog], s, 31); g_nlog++; } }
void Motor_FeedWatchdog(void) { logc("feed"); }
void Motor_SetWheelSpeedMMPS(uint8_t id, float mm_s) { (void)id; (void)mm_s; logc("set"); }
void Motor_StopAll(void) { logc("stopall"); }
int32_t Motor_GetLeftCount(void) { return 0; }
int32_t Motor_GetRightCount(void) { return 0; }
void Contactor_On(void) {}
void Contactor_Off(void) {}
void SR04T_GetReading(uint8_t i, uint16_t *mm, uint8_t *valid) { (void)i; *mm = 0U; *valid = 0U; }
float BNO08x_GetLastYaw(uint8_t *valid) { *valid = 1U; return 0.0f; }
uint8_t BNO08x_GetAccuracy(void) { return 3U; }
void BNO08x_SetYawDeg(float d) { (void)d; }
void BNO08x_ClearYawOffset(void) {}
/* DIAG-only functions: linked but never exercised here. */
uint8_t BNO08x_ReadRotationVector(float *a, float *b, float *c, float *d, BNO08x_Euler *e) { (void)a; (void)b; (void)c; (void)d; (void)e; return 0U; }
uint8_t BNO08x_EnableRotationVector(uint16_t i) { (void)i; return 1U; }
uint32_t BNO08x_BusClockHz(void) { return 0U; }
void BNO08x_BusIdle(uint8_t *a, uint8_t *b) { *a = *b = 1U; }
void BNO08x_BusPullTest(uint8_t *a, uint8_t *b) { *a = *b = 1U; }
uint8_t BNO08x_ScanBus(uint8_t *f, uint8_t m) { (void)f; (void)m; return 0U; }
uint8_t BNO08x_Diag(void) { return 0U; }
uint8_t BNO08x_SelfTest(uint8_t *a, uint8_t *b) { *a = *b = 0U; return 1U; }
uint16_t BNO08x_PeekPacketLen(uint8_t *ch) { *ch = 0U; return 0U; }
uint32_t BNO08x_GetSampleRate(void) { return 0U; }
uint32_t BNO08x_GetBusWarnCount(void) { return 0U; }
uint32_t BNO08x_GetBusRecoverCount(void) { return 0U; }
uint8_t BNO08x_IsDwtOk(void) { return 1U; }

static int g_busy_for_err = 0;            /* CDC refuses ERR lines when set */
static int g_n_fb = 0, g_n_err = 0;
static char g_last_fb[256];
uint8_t CDC_Transmit_FS(uint8_t *buf, uint16_t len)
{
    if (len >= 4 && memcmp(buf, "ERR,", 4) == 0)
    {
        if (g_busy_for_err) return USBD_BUSY;
        g_n_err++;
    }
    else if (len >= 3 && memcmp(buf, "FB,", 3) == 0)
    {
        g_n_fb++;
        memcpy(g_last_fb, buf, len < 255 ? len : 255); g_last_fb[len < 255 ? len : 255] = '\0';
    }
    return USBD_OK;
}

static void rx(const char *s) { while (*s) Protocol_ProcessRxByte((uint8_t)*s++); }
static void run_ms(int ms) { for (int i = 0; i < ms; i++) { g_now++; Protocol_Update(); } }

/* ---- tests ------------------------------------------------------------ */
static void test_cmd_feeds_watchdog_first(void)
{
    printf("test_cmd_feeds_watchdog_first\n");
    Protocol_Init(); g_nlog = 0;
    rx("CMD,7,120,-80\r\n");
    Protocol_Update();
    CHECK(g_nlog == 3 && strcmp(g_log[0], "feed") == 0 &&
          strcmp(g_log[1], "set") == 0 && strcmp(g_log[2], "set") == 0,
          "CMD -> feed watchdog, then set left and right speed");
    g_nlog = 0;
    rx("STOP,8\r\n"); rx("TARE,9\r\n"); rx("CONTACTOR,10,ON\r\n");
    Protocol_Update();
    CHECK(g_nlog == 1 && strcmp(g_log[0], "stopall") == 0, "STOP/TARE/CONTACTOR never feed the motion watchdog");
}

static void test_main_loop_timeout(void)
{
    printf("test_main_loop_timeout\n");
    Protocol_Init(); g_nlog = 0;
    rx("CMD,1,100,100\r\n");
    Protocol_Update();                       /* accepted at t0 */
    g_nlog = 0;
    run_ms(CMD_TIMEOUT_MS);                  /* t0 + 300 ms: not yet */
    int stopped_at_300 = 0;
    for (int i = 0; i < g_nlog; i++) if (strcmp(g_log[i], "stopall") == 0) stopped_at_300 = 1;
    run_ms(1);                               /* t0 + 301 ms */
    int stopped_at_301 = 0;
    for (int i = 0; i < g_nlog; i++) if (strcmp(g_log[i], "stopall") == 0) stopped_at_301 = 1;
    CHECK(!stopped_at_300 && stopped_at_301, "motors stopped on the first loop after 300 ms without a CMD");
    run_ms(25);
    CHECK(strstr(g_last_fb, ",TIMEOUT,") != NULL, "FB reports TIMEOUT");
}

static void test_pending_err_does_not_block_fb(void)
{
    printf("test_pending_err_does_not_block_fb\n");
    Protocol_Init();
    /* 9 lines in one burst: the 8-line queue overflows -> one bad line. */
    for (int i = 0; i < 9; i++) { char l[32]; snprintf(l, sizeof l, "CMD,%d,50,50\r\n", i); rx(l); }
    g_busy_for_err = 1;                      /* the ERR line can never be queued */
    g_n_fb = 0; g_n_err = 0;
    run_ms(1000);
    CHECK(g_n_err == 0, "ERR stays pending while CDC refuses it");
    CHECK(g_n_fb >= 45, "FB keeps flowing at ~50 Hz meanwhile (old firmware: 0)");
    g_busy_for_err = 0; g_n_fb = 0;
    run_ms(200);
    CHECK(g_n_err == 1, "ERR,bad_command sent once CDC accepts it");
    CHECK(g_n_fb >= 8, "FB continues after the ERR");
}

static void test_line_overflow_reports_bad(void)
{
    printf("test_line_overflow_reports_bad\n");
    Protocol_Init(); g_busy_for_err = 0; g_n_err = 0; g_nlog = 0;
    char big[200]; memset(big, '1', sizeof big); big[0] = 'C'; big[sizeof big - 3] = '\r'; big[sizeof big - 2] = '\n'; big[sizeof big - 1] = '\0';
    rx(big);
    run_ms(30);
    CHECK(g_n_err == 1, "over-long line -> ERR,bad_command");
    CHECK(g_nlog == 0, "and no motor call was made for it");
}

int main(void)
{
    test_cmd_feeds_watchdog_first();
    test_main_loop_timeout();
    test_pending_err_does_not_block_fb();
    test_line_overflow_reports_bad();
    if (g_fail == 0) { printf("\nTAT CA TEST PASS\n"); return 0; }
    printf("\n%d TEST FAIL\n", g_fail);
    return 1;
}
