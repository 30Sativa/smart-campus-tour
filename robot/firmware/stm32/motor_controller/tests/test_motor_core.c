/**
 * Host test (gcc) for the step generator and its ISR watchdog
 * (Core/Src/motor/motor_core.c, see docs/MOTOR_ISR_BUDGET.md).
 * HAL is replaced by tests/stubs/main.h; the TIM2 ISR is driven by tick().
 * Run: ./scripts/verify.sh
 */
#include "motor/motor_core.h"

#include <stdio.h>
#include <string.h>

static int g_fail = 0;
int g_irq_disabled = 0;

#define CHECK(cond, msg)                                                       \
    do {                                                                       \
        if (cond) { printf("  ok   %s\n", (msg)); }                            \
        else      { printf("  FAIL %s   (%s:%d)\n", (msg), __FILE__, __LINE__); g_fail++; } \
    } while (0)

/* ---- HAL stand-ins ---------------------------------------------------- */
static TIM_TypeDef g_tim2;
TIM_HandleTypeDef htim2 = { &g_tim2 };
static GPIO_TypeDef g_gpioa, g_gpiob;
static int g_dir_writes[2];
static int8_t g_dir_last[2];
static int g_high_events[2];   /* step pin rising edges seen at BSRR */

uint32_t MotorHal_GetBaseTimerHz(void) { return 50000U; }
void MotorHal_WriteStepLow(const MotorHalPins *pins)  { pins->step_port->BSRR = (uint32_t)pins->step_pin << 16U; }
void MotorHal_WriteStepHigh(const MotorHalPins *pins) { pins->step_port->BSRR = pins->step_pin; }
void MotorHal_WriteDir(const MotorHalPins *pins, int8_t direction)
{
    int i = (pins->dir_pin == 1U) ? 0 : 1;
    g_dir_writes[i]++; g_dir_last[i] = direction;
}

static const MotorHalPins LEFT  = { &g_gpioa, 1U << 0, &g_gpiob, 1U, 0U };
static const MotorHalPins RIGHT = { &g_gpioa, 1U << 2, &g_gpiob, 2U, 1U };

/* One TIM2 update interrupt. Records step rising edges per wheel. */
static void tick(void)
{
    g_tim2.SR = 1U; g_tim2.DIER = 1U; g_gpioa.BSRR = 0U;
    MotorCore_HandleTimerInterrupt();
    if (g_gpioa.BSRR & (1U << 0)) g_high_events[0]++;
    if (g_gpioa.BSRR & (1U << 2)) g_high_events[1]++;
}
static void ticks(long n) { for (long i = 0; i < n; i++) tick(); }

static void reset(void)
{
    memset(g_high_events, 0, sizeof(g_high_events));
    MotorCore_Init(&LEFT, &RIGHT);
}

/* ---- tests ------------------------------------------------------------ */
static void test_no_feed_no_steps(void)
{
    printf("test_no_feed_no_steps\n");
    reset();
    MotorCore_SetStepFrequencyHz(0, 1000.0f, 1);   /* never fed since boot */
    ticks(5000);
    CHECK(MotorCore_GetCount(0) == 0, "boot: watchdog expired -> no steps until first feed");
    CHECK(MotorCore_IsRunning(0) == 0U, "boot: ISR cleared running");
}

static void test_feed_500ms_window(void)
{
    printf("test_feed_500ms_window\n");
    reset();
    MotorCore_FeedWatchdog(500U);                  /* 25000 ticks at 50 kHz */
    MotorCore_SetStepFrequencyHz(0, 1000.0f, 1);
    MotorCore_SetStepFrequencyHz(1, 2000.0f, -1);
    ticks(25000);
    CHECK(MotorCore_IsRunning(0) == 1U && MotorCore_IsRunning(1) == 1U, "still running after 25000 ticks (500 ms)");
    int32_t l = MotorCore_GetCount(0), r = MotorCore_GetCount(1);
    CHECK(l >= 499 && l <= 501, "left ~500 steps in 500 ms at 1 kHz");
    CHECK(r <= -999 && r >= -1001, "right ~-1000 steps in 500 ms at 2 kHz reverse");
    tick();                                        /* tick 25001: expired */
    CHECK(MotorCore_IsRunning(0) == 0U && MotorCore_IsRunning(1) == 0U, "stopped on the first tick after 500 ms");
    int hl = g_high_events[0];
    ticks(50000);
    CHECK(g_high_events[0] == hl && MotorCore_GetCount(0) == l, "no further step pulses after expiry");
}

static void test_pulse_completes_after_expiry(void)
{
    printf("test_pulse_completes_after_expiry\n");
    reset();
    MotorCore_FeedWatchdog(1U);                    /* 50 ticks */
    MotorCore_SetStepFrequencyHz(0, 12000.0f, 1);
    long t, last_high = -1;
    for (t = 0; t < 200; t++)
    {
        tick();
        if (g_gpioa.BSRR & (1U << 0)) last_high = t;
    }
    /* run once more to see the level the pin was left at */
    int low_seen = 0;
    reset();
    MotorCore_FeedWatchdog(1U);
    MotorCore_SetStepFrequencyHz(0, 12000.0f, 1);
    for (t = 0; t < 200; t++)
    {
        tick();
        if (t == last_high + 1) low_seen = (g_gpioa.BSRR & ((1U << 0) << 16U)) != 0U;
    }
    CHECK(last_high >= 0 && last_high < 50, "last rising edge inside the 50-tick window");
    CHECK(low_seen, "the pulse high at expiry is still driven low on the next tick");
}

static void test_keep_feeding_never_stops(void)
{
    printf("test_keep_feeding_never_stops\n");
    reset();
    MotorCore_FeedWatchdog(500U);
    MotorCore_SetStepFrequencyHz(0, 6546.0f, 1);
    for (int k = 0; k < 200; k++) { ticks(1000); MotorCore_FeedWatchdog(500U); }   /* CMD every 20 ms for 4 s */
    CHECK(MotorCore_IsRunning(0) == 1U, "fed every 20 ms -> still running after 4 s");
    int32_t c = MotorCore_GetCount(0);
    CHECK(c >= 26180 && c <= 26188, "~26184 steps in 4 s at 6546 Hz (no dropped steps)");
}

static void test_restart_after_expiry(void)
{
    printf("test_restart_after_expiry\n");
    reset();
    MotorCore_FeedWatchdog(10U);
    MotorCore_SetStepFrequencyHz(0, 1000.0f, 1);
    ticks(2000);
    CHECK(MotorCore_IsRunning(0) == 0U, "expired");
    int dirw = g_dir_writes[0];
    int32_t c0 = MotorCore_GetCount(0);
    MotorCore_FeedWatchdog(500U);                  /* next CMD */
    MotorCore_SetStepFrequencyHz(0, 1000.0f, 1);
    CHECK(MotorCore_IsRunning(0) == 1U, "next CMD restarts the motor");
    CHECK(g_dir_writes[0] == dirw + 1, "restart re-writes DIR (phase reset path)");
    ticks(5000);
    int32_t d = MotorCore_GetCount(0) - c0;
    CHECK(d >= 99 && d <= 101, "~100 steps in 100 ms after restart");
}

static void test_stop_and_direction_change(void)
{
    printf("test_stop_and_direction_change\n");
    reset();
    MotorCore_FeedWatchdog(500U);
    MotorCore_SetStepFrequencyHz(0, 12000.0f, 1);
    long t;
    for (t = 0; t < 100 && !(g_gpioa.BSRR & 1U); t++) tick();   /* stop right after a rising edge */
    MotorCore_Stop(0);
    CHECK((g_gpioa.BSRR & (1U << 16)) != 0U, "Stop drives STEP low immediately");
    CHECK(MotorCore_IsRunning(0) == 0U, "Stop clears running");
    MotorCore_SetStepFrequencyHz(0, 1000.0f, 1);
    ticks(500);
    int32_t c = MotorCore_GetCount(0);
    MotorCore_SetStepFrequencyHz(0, 1000.0f, -1);
    CHECK(g_dir_last[0] == -1, "direction change writes the new DIR");
    ticks(5000);
    CHECK(MotorCore_GetCount(0) - c <= -99, "count decreases after reversing");
    CHECK(g_irq_disabled == 0, "critical sections balanced");
}

static void test_isr_flag_handling(void)
{
    printf("test_isr_flag_handling\n");
    reset();
    MotorCore_FeedWatchdog(500U);
    MotorCore_SetStepFrequencyHz(0, 12000.0f, 1);
    g_tim2.SR = 0U; g_tim2.DIER = 1U;
    MotorCore_HandleTimerInterrupt();
    g_tim2.SR = 1U; g_tim2.DIER = 0U;
    MotorCore_HandleTimerInterrupt();
    CHECK(MotorCore_GetCount(0) == 0, "no tick without UIF or with UIE disabled");
    g_tim2.SR = 1U | 0x2U; g_tim2.DIER = 1U;      /* UIF + CC1IF pending */
    MotorCore_HandleTimerInterrupt();
    CHECK(g_tim2.SR == ~TIM_FLAG_UPDATE, "SR written with ~UIF (rc_w0), no read-modify-write");
}

static void test_feed_limits(void)
{
    printf("test_feed_limits\n");
    reset();
    MotorCore_FeedWatchdog(0U);
    MotorCore_SetStepFrequencyHz(0, 1000.0f, 1);
    tick();
    CHECK(MotorCore_IsRunning(0) == 1U, "feed(0) still allows one tick");
    tick();
    CHECK(MotorCore_IsRunning(0) == 0U, "feed(0) expires on the second tick");
    /* 85899346 ms * 50 kHz = 2^32 + 4 ticks: a 32-bit wrap would leave 4. */
    MotorCore_FeedWatchdog(85899346U);
    MotorCore_SetStepFrequencyHz(0, 1000.0f, 1);
    ticks(1000);
    CHECK(MotorCore_IsRunning(0) == 1U, "huge timeout clamps instead of wrapping to ~0");
}

int main(void)
{
    test_no_feed_no_steps();
    test_feed_500ms_window();
    test_pulse_completes_after_expiry();
    test_keep_feeding_never_stops();
    test_restart_after_expiry();
    test_stop_and_direction_change();
    test_isr_flag_handling();
    test_feed_limits();

    if (g_fail == 0) { printf("\nTAT CA TEST PASS\n"); return 0; }
    printf("\n%d TEST FAIL\n", g_fail);
    return 1;
}
