/**
 * Host test (gcc) for Core/Src/motor/motor_encoder_core.c: the 16 -> 32-bit
 * extension of the TIM3/TIM8 encoder counters, speed window, TERRF counting
 * and receiver state. Simulated CNT values only, not hardware evidence.
 * Run: ./scripts/verify.sh
 */
#include "motor/motor_encoder_core.h"

#include <stdint.h>
#include <stdio.h>

static int g_fail = 0;
int g_irq_disabled = 0;
#define CHECK(cond, msg)                                                       \
    do {                                                                       \
        if (cond) { printf("  ok   %s\n", (msg)); }                            \
        else      { printf("  FAIL %s   (%s:%d)\n", (msg), __FILE__, __LINE__); g_fail++; } \
    } while (0)

static MotorEncoderStatus st(uint8_t ch)
{
    MotorEncoderStatus s;
    MotorEncoderCore_GetStatus(ch, &s);
    return s;
}

/* Hardware timer as the ISR sees it: a 16-bit CNT moved by `step` per ms. */
static uint16_t g_cnt[2];
static void run(uint8_t ch, int ms, int step)
{
    for (int i = 0; i < ms; i++)
    {
        g_cnt[ch] = (uint16_t)(g_cnt[ch] + (uint16_t)step);
        MotorEncoderCore_Sample(ch, g_cnt[ch], 0U, 0U, 0U);
    }
}

static void test_disabled(void)
{
    printf("test_disabled\n");
    MotorEncoderCore_Init(0U);
    CHECK(MotorEncoderCore_GetState() == MOTOR_ENCODER_DISABLED, "MOTOR_ENCODER_ENABLE=0 -> DISABLED (0)");
    MotorEncoderCore_SetReceiver(1U);
    CHECK(MotorEncoderCore_GetState() == MOTOR_ENCODER_DISABLED, "SetReceiver cannot turn a disabled build on");
    MotorEncoderCore_Sample(0U, 100U, 1U, 1U, 1U);
    MotorEncoderCore_Sample(0U, 200U, 1U, 1U, 1U);
    CHECK(st(0).count == 0 && st(0).transition_errors == 0U, "samples ignored when disabled");
}

static void test_receiver_state(void)
{
    printf("test_receiver_state\n");
    MotorEncoderCore_Init(1U);
    CHECK(MotorEncoderCore_GetState() == MOTOR_ENCODER_RX_OFF, "enabled, receiver not yet on -> RX_OFF (1)");
    MotorEncoderCore_SetReceiver(1U);
    CHECK(MotorEncoderCore_GetState() == MOTOR_ENCODER_RX_ON, "SetReceiver(1) -> RX_ON (2)");
    MotorEncoderCore_SetReceiver(0U);
    CHECK(MotorEncoderCore_GetState() == MOTOR_ENCODER_RX_OFF, "SetReceiver(0) -> RX_OFF");
}

static void test_first_sample_is_baseline(void)
{
    printf("test_first_sample_is_baseline\n");
    MotorEncoderCore_Init(1U);
    MotorEncoderCore_Sample(0U, 40000U, 0U, 1U, 0U);
    CHECK(st(0).count == 0, "first CNT after Init is only a reference (no jump from 0 to 40000)");
    CHECK(st(0).level_a == 1U && st(0).level_b == 0U, "pin levels recorded");
    MotorEncoderCore_Sample(0U, 40010U, 0U, 0U, 1U);
    CHECK(st(0).count == 10, "then counts the change");
    CHECK(st(1).count == 0, "right channel independent");
}

static void test_16bit_wrap_both_ways(void)
{
    printf("test_16bit_wrap_both_ways\n");
    MotorEncoderCore_Init(1U);
    g_cnt[0] = 65500U;
    MotorEncoderCore_Sample(0U, g_cnt[0], 0U, 0U, 0U);
    run(0U, 10, 30);                         /* crosses 65535 -> 0 */
    CHECK(st(0).count == 300, "forward across the 16-bit wrap: +300");
    run(0U, 20, -30);                        /* back across 0 -> 65535 */
    CHECK(st(0).count == -300, "backward across the wrap: -300");
    /* 30 counts/ms = 30000 counts/s, about the top wheel speed with 2.5 count/STEP. */
    run(0U, 5000, 30);
    CHECK(st(0).count == -300 + 150000, "5 s at 30k counts/s: no count lost over many wraps");
    run(1U, 1, 0);
    run(1U, 1, 32767);
    CHECK(st(1).count == 32767, "largest step per sample that is still unambiguous (32767)");
}

static void test_int32_wrap(void)
{
    printf("test_int32_wrap\n");
    MotorEncoderCore_Init(1U);
    g_cnt[0] = 0U;
    MotorEncoderCore_Sample(0U, 0U, 0U, 0U, 0U);
    /* Drive the 32-bit counter to just below INT32_MAX, then past it. */
    for (int i = 0; i < 65538; i++) run(0U, 1, 32767);   /* 2147483646 */
    int32_t before = st(0).count;
    run(0U, 1, 32767);
    int32_t after = st(0).count;
    CHECK(before == 2147483646 && (uint32_t)after - (uint32_t)before == 32767U, "int32 wraps modulo 2^32 like the STEP count (host uses diff32)");
}

static void test_speed_window(void)
{
    printf("test_speed_window\n");
    MotorEncoderCore_Init(1U);
    g_cnt[0] = 0U;
    MotorEncoderCore_Sample(0U, 0U, 0U, 0U, 0U);
    run(0U, MOTOR_ENCODER_SPEED_WINDOW_MS - 1, 5);
    CHECK(st(0).speed_cps == 0, "no speed before the first full window");
    run(0U, 1, 5);
    CHECK(st(0).speed_cps == 5000, "5 counts/ms -> 5000 counts/s");
    run(0U, MOTOR_ENCODER_SPEED_WINDOW_MS, -2);
    CHECK(st(0).speed_cps == -2000, "reverse -> negative counts/s");
    run(0U, MOTOR_ENCODER_SPEED_WINDOW_MS, 0);
    CHECK(st(0).speed_cps == 0, "standstill -> 0");
}

static void test_transition_errors(void)
{
    printf("test_transition_errors\n");
    MotorEncoderCore_Init(1U);
    MotorEncoderCore_Sample(1U, 0U, 1U, 0U, 0U);   /* baseline sample can carry one too */
    MotorEncoderCore_Sample(1U, 4U, 0U, 0U, 0U);
    MotorEncoderCore_Sample(1U, 8U, 1U, 0U, 0U);
    MotorEncoderCore_Sample(1U, 8U, 1U, 0U, 0U);
    CHECK(st(1).transition_errors == 3U, "one TERR per sample that saw TERRF");
    CHECK(st(0).transition_errors == 0U, "left untouched");
    CHECK(st(1).count == 8, "TERR does not change the count");
    MotorEncoderCore_Init(1U);
    CHECK(st(1).transition_errors == 0U && st(1).count == 0, "Init (MCU boot) clears everything");
}

int main(void)
{
    test_disabled();
    test_receiver_state();
    test_first_sample_is_baseline();
    test_16bit_wrap_both_ways();
    test_int32_wrap();
    test_speed_window();
    test_transition_errors();
    if (g_fail == 0) { printf("\nTAT CA TEST PASS\n"); return 0; }
    printf("\n%d TEST FAIL\n", g_fail);
    return 1;
}
