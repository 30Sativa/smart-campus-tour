/**
 * Host test (gcc) for Core/Src/usb_protocol.c with HAL/USB/motor/IMU stubbed:
 *  - an accepted CMD re-arms the ISR watchdog BEFORE setting wheel speeds
 *  - the main-loop CMD timeout (CMD_TIMEOUT_MS) stops the motors
 *  - a pending ERR,bad_command no longer suppresses FB frames
 *  - HEAD commands (PAN/TILT): ZERO/OFF/angles, specific ERR lines, FB fields
 * head_core.c is linked for real (pure logic); its TIM6 tick is driven by
 * run_ms(). Run: ./scripts/verify.sh
 */
#include "usb_protocol.h"
#include "motor/motor.h"
#include "usbd_cdc_if.h"
#include "imu/bno08x.h"
#include "sonar/sr04t.h"
#include "head/head_core.h"
#include "contactor/contactor.h"

#include <math.h>
#include <stdio.h>
#include <stdlib.h>
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
static uint8_t g_contactor = 0U;
static int g_contactor_calls = 0;
void Contactor_On(void) { g_contactor = 1U; g_contactor_calls++; }
void Contactor_Off(void) { g_contactor = 0U; g_contactor_calls++; }
uint8_t Contactor_IsCommandedOn(void) { return g_contactor; }
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
uint32_t BNO08x_GetRearmCount(void) { return 7U; }
uint32_t BNO08x_GetResetSeenCount(void) { return 2U; }

static int g_busy_for_err = 0;            /* CDC refuses ERR lines when set */
static int g_n_fb = 0, g_n_err = 0;
static char g_last_fb[256];
static char g_last_err[64];
uint8_t CDC_Transmit_FS(uint8_t *buf, uint16_t len)
{
    if (len >= 4 && memcmp(buf, "ERR,", 4) == 0)
    {
        if (g_busy_for_err) return USBD_BUSY;
        g_n_err++;
        memcpy(g_last_err, buf, len < 63 ? len : 63); g_last_err[len < 63 ? len : 63] = '\0';
    }
    else if (len >= 3 && memcmp(buf, "FB,", 3) == 0)
    {
        g_n_fb++;
        memcpy(g_last_fb, buf, len < 255 ? len : 255); g_last_fb[len < 255 ? len : 255] = '\0';
    }
    return USBD_OK;
}

static void rx(const char *s) { while (*s) Protocol_ProcessRxByte((uint8_t)*s++); }
static void run_ms(int ms)
{
    for (int i = 0; i < ms; i++)
    {
        g_now++;
        for (unsigned t = 0; t < HEAD_TICK_HZ / 1000U; t++) HeadCore_HandleTick();
        Protocol_Update();
        HeadCore_Service(g_now);
    }
}

/* Truong thu n (0 = "FB") cua khung FB cuoi, -999999 neu khong co. */
static long fb_field(int n)
{
    const char *c = g_last_fb;
    for (int i = 0; i < n; i++) { c = strchr(c, ','); if (c == NULL) return -999999; c++; }
    return strtol(c, NULL, 10);
}

/* GPIO gia cho head_core (STEP/DIR/nEN) - chi can BSRR. */
static GPIO_TypeDef g_head_gpio[6];
static void head_reset(void)
{
    static const HeadAxisPins pan  = { &g_head_gpio[0], 1U, &g_head_gpio[1], 1U, 0U, &g_head_gpio[2], 1U };
    static const HeadAxisPins tilt = { &g_head_gpio[3], 1U, &g_head_gpio[4], 1U, 0U, &g_head_gpio[5], 1U };
    HeadCore_Init(&pan, &tilt);
}

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
    head_reset();
    rx("STOP,8\r\n"); rx("TARE,9\r\n"); rx("HEAD,10,ZERO\r\n"); rx("HEAD,11,1000,0\r\n"); rx("HEAD,12,OFF\r\n");
    rx("CONTACTOR,13,ON\r\n");
    Protocol_Update();
    CHECK(g_nlog == 1 && strcmp(g_log[0], "stopall") == 0, "STOP/TARE/HEAD/CONTACTOR never feed the motion watchdog");
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

static void test_fb_appends_imu_recovery_counters(void)
{
    printf("test_fb_appends_imu_recovery_counters\n");
    Protocol_Init(); g_n_fb = 0; g_last_fb[0] = '\0';
    run_ms(25);
    int fields = 1;
    for (const char *c = g_last_fb; *c && *c != '\r'; c++) if (*c == ',') fields++;
    CHECK(g_n_fb >= 1, "an FB frame was sent");
    CHECK(fields == 24, "FB has 24 fields (19 + head_seq, pan, tilt, head_state, contactor)");
    CHECK(fb_field(16) == 3 && fb_field(17) == 7 && fb_field(18) == 2, "yaw_acc stays field 16, IMU counters 17-18 unchanged");
}

static void test_contactor_pa10(void)
{
    printf("test_contactor_pa10\n");
    Protocol_Init(); g_busy_for_err = 0; g_n_err = 0; g_last_err[0] = '\0';
    g_contactor = 0U; g_contactor_calls = 0;
    run_ms(25);
    CHECK(fb_field(23) == 0, "boot: FB contactor field = 0");
    rx("CONTACTOR,5,ON\r\n"); run_ms(25);
    CHECK(g_contactor == 1U && g_contactor_calls == 1, "CONTACTOR,<seq>,ON -> Contactor_On()");
    CHECK(fb_field(23) == 1 && fb_field(1) == 5, "FB contactor field = 1, seq echoed");
    rx("contactor,6,off\r\n"); run_ms(25);
    CHECK(g_contactor == 0U && fb_field(23) == 0, "case-insensitive OFF -> Contactor_Off(), FB 0");
    g_contactor_calls = 0;
    rx("CONTACTOR,7,MAYBE\r\n"); rx("CONTACTOR,8\r\n"); run_ms(30);
    CHECK(g_contactor_calls == 0 && g_n_err >= 1 && strcmp(g_last_err, "ERR,bad_command\r\n") == 0,
          "malformed CONTACTOR -> ERR,bad_command, output untouched");
    rx("CONTACTOR,9,ON\r\n"); run_ms(CMD_TIMEOUT_MS + 50);
    CHECK(g_contactor == 1U && strstr(g_last_fb, ",TIMEOUT,") != NULL,
          "CMD timeout stops the wheels but leaves the contactor as commanded");
    rx("STOP,10\r\n"); run_ms(25);
    CHECK(g_contactor == 1U, "STOP does not switch the contactor either");
    rx("CONTACTOR,11,OFF\r\n"); run_ms(25);
}

static void test_head_flow(void)
{
    printf("test_head_flow\n");
    Protocol_Init(); head_reset(); g_busy_for_err = 0; g_n_err = 0; g_last_err[0] = '\0';
    run_ms(25);
    CHECK(fb_field(19) == 0 && fb_field(22) == 0, "boot: head_seq 0, head_state 0 (OFF)");

    rx("HEAD,20,9000,0\r\n"); run_ms(25);
    CHECK(strcmp(g_last_err, "ERR,head_not_zeroed\r\n") == 0, "HEAD before ZERO -> ERR,head_not_zeroed");
    CHECK(fb_field(19) == 0, "rejected HEAD does not update head_seq");
    CHECK(fb_field(1) == 20, "FB seq still echoes the last command seen");

    rx("HEAD,21,ZERO\r\n"); run_ms(25);
    CHECK(fb_field(19) == 21 && fb_field(22) == 1, "ZERO -> head_seq 21, state IDLE");

    rx("HEAD,22,9000,-1500\r\n"); run_ms(25);
    CHECK(fb_field(19) == 22 && fb_field(22) == 2, "angle command -> head_seq 22, state MOVING");
    run_ms(3000);
    CHECK(fb_field(22) == 1 && fb_field(20) == 9000, "after the move: IDLE, pan 9000 cdeg");
    CHECK(labs(fb_field(21) + 1500) <= 91, "tilt -1500 cdeg (within half a full step)");

    g_n_err = 0;
    rx("HEAD,23,18001,0\r\n"); run_ms(25);
    CHECK(g_n_err == 1 && strcmp(g_last_err, "ERR,head_limit\r\n") == 0, "beyond limit -> ERR,head_limit");
    CHECK(fb_field(19) == 22, "head_seq unchanged after a rejected command");
    CHECK(strstr(g_last_fb, ",ERR,") == NULL, "a rejected HEAD does not turn the wheel status into ERR");

    g_n_err = 0;
    rx("HEAD,24,1.5,0\r\n"); rx("HEAD,25,LEFT\r\n"); rx("HEAD,26,1,2,3\r\n"); run_ms(25);
    CHECK(g_n_err >= 1 && strcmp(g_last_err, "ERR,bad_command\r\n") == 0, "malformed HEAD -> ERR,bad_command");

    rx("HEAD,27,-9000,0\r\n"); run_ms(300);
    CHECK(fb_field(22) == 2, "moving back");
    rx("HEAD,28,ZERO\r\n"); run_ms(25);
    CHECK(strcmp(g_last_err, "ERR,head_busy\r\n") == 0, "ZERO while moving -> ERR,head_busy");
    rx("STOP,29\r\n"); run_ms(100);
    CHECK(fb_field(22) == 2, "wheel STOP does NOT touch the head (bridge sends STOP at 20 Hz)");
    rx("HEAD,29,STOP\r\n"); run_ms(1500);
    CHECK(fb_field(22) == 1, "HEAD,<seq>,STOP ramps the head to a halt (IDLE), drivers stay on");
    long pan_after_stop = fb_field(20);
    CHECK(pan_after_stop > -9000 && pan_after_stop < 9000, "STOP halted the head before its target");

    rx("HEAD,30,OFF\r\n"); run_ms(25);
    CHECK(fb_field(19) == 30 && fb_field(22) == 0, "OFF -> state OFF");
    rx("HEAD,31,0,0\r\n"); run_ms(25);
    CHECK(strcmp(g_last_err, "ERR,head_not_zeroed\r\n") == 0, "after OFF the reference is gone");
}

static void test_head_home_step_jog(void)
{
    printf("test_head_home_step_jog\n");
    Protocol_Init(); head_reset(); g_busy_for_err = 0; g_n_err = 0; g_last_err[0] = '\0';
    rx("HEAD,40,STEP,1,0\r\n"); run_ms(25);
    CHECK(strcmp(g_last_err, "ERR,head_not_zeroed\r\n") == 0, "STEP before HOME -> ERR,head_not_zeroed");
    rx("HEAD,41,HOME\r\n"); run_ms(25);
    CHECK(fb_field(19) == 41 && fb_field(22) == 3, "HOME -> head_seq 41, state 3 (HOMING)");
    rx("HEAD,42,1000,0\r\n"); run_ms(25);
    CHECK(strcmp(g_last_err, "ERR,head_busy\r\n") == 0, "angle command during HOME -> ERR,head_busy");
    /* Nhu stm32_bridge khi robot dung yen: STOP moi 50 ms suot luc HOME. */
    for (int i = 0; i < 600; i++) { char l[32]; snprintf(l, sizeof l, "STOP,%d\r\n", 1000 + i); rx(l); run_ms(50); }
    CHECK(fb_field(22) == 1 && fb_field(20) == 0 && fb_field(21) == 0, "HOME completes despite STOP at 20 Hz: IDLE at 0/0");

    rx("HEAD,43,STEP,1,-1\r\n"); run_ms(500);
    /* 1 buoc du tai truc ra = 36000 / (200 * hop so) centi-do: PAN 60 (3:1), TILT 36 (5:1). */
    CHECK(fb_field(19) == 43 && fb_field(20) == lroundf(36000.0f / (HEAD_MOTOR_STEPS_PER_REV * HEAD_PAN_GEAR_RATIO)) &&
          fb_field(21) == -lroundf(36000.0f / (HEAD_MOTOR_STEPS_PER_REV * HEAD_TILT_GEAR_RATIO)),
          "STEP,1,-1 -> PAN +1 full step, TILT -1 full step at the output shaft");

    for (int i = 0; i < 10; i++) { char l[40]; snprintf(l, sizeof l, "HEAD,%d,JOG,-1,0\r\n", 50 + i); rx(l); run_ms(100); }
    CHECK(fb_field(22) == 2 && fb_field(20) < 0, "JOG held 1 s: moving left->right (negative)");
    run_ms(1500);
    CHECK(fb_field(22) == 1, "no more JOG keepalives -> deadman halts (IDLE)");

    g_n_err = 0;
    rx("HEAD,60,JOG,2,0\r\n"); rx("HEAD,61,STEP,1\r\n"); rx("HEAD,62,SPIN,1,1\r\n"); run_ms(30);
    CHECK(g_n_err >= 1 && strcmp(g_last_err, "ERR,bad_command\r\n") == 0, "JOG dir out of -1..1 / malformed -> ERR,bad_command");
    g_nlog = 0;
    rx("HEAD,63,JOG,1,1\r\n"); run_ms(5);
    int fed = 0; for (int i = 0; i < g_nlog; i++) if (strcmp(g_log[i], "feed") == 0) fed = 1;
    CHECK(!fed, "JOG keepalives never feed the wheel watchdog");
    rx("HEAD,64,STOP\r\n"); run_ms(1000);
    CHECK(fb_field(22) == 1, "HEAD,<seq>,STOP halts a JOG");
    /* DIAG -> HeadCore_Halt(): khong test o day, DIAG cho HAL_GetTick() tang ma stub khong tu chay. */
}

int main(void)
{
    test_cmd_feeds_watchdog_first();
    test_main_loop_timeout();
    test_pending_err_does_not_block_fb();
    test_line_overflow_reports_bad();
    test_fb_appends_imu_recovery_counters();
    test_contactor_pa10();
    test_head_flow();
    test_head_home_step_jog();
    if (g_fail == 0) { printf("\nTAT CA TEST PASS\n"); return 0; }
    printf("\n%d TEST FAIL\n", g_fail);
    return 1;
}
