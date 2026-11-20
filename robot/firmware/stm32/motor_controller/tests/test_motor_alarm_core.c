/**
 * Host test (gcc) for Core/Src/motor/motor_alarm_core.c: ALM debounce of the
 * two HBS57H drivers. The SysTick sampling of motor_alarm.c is reproduced by
 * tick(): it alternates the internal pull exactly like the firmware, and each
 * channel is modelled by the level its pin shows under pull-up / pull-down
 * (driven pin: same both; floating pin: follows the pull).
 *
 * SIMULATION ONLY: this proves the filter logic, not the HBS57H ALM output.
 * Built twice by scripts/verify.sh: default (ALM active LOW) and with
 * -DMOTOR_ALARM_ACTIVE_LEVEL=1.
 */
#include "motor/motor_alarm_core.h"

#include <stdio.h>
#include <string.h>

static int g_fail = 0;
int g_irq_disabled = 0;
#define CHECK(cond, msg)                                                       \
    do {                                                                       \
        if (cond) { printf("  ok   %s\n", (msg)); }                            \
        else      { printf("  FAIL %s   (%s:%d)\n", (msg), __FILE__, __LINE__); g_fail++; } \
    } while (0)

#define ACT   ((uint8_t)MOTOR_ALARM_ACTIVE_LEVEL)
#define IDLE  ((uint8_t)(ACT ^ 1U))

/* Pin model per channel. */
typedef enum { PIN_FLOAT, PIN_NORMAL, PIN_FAULT } PinModel;
static PinModel g_pin[2];
static uint32_t g_now = 1000U;
static uint8_t g_pulled_up = 1U;
static uint8_t g_probe = 1U;

static uint8_t pin_level(PinModel m, uint8_t pulled_up)
{
    switch (m)
    {
    case PIN_NORMAL: return IDLE;
    case PIN_FAULT:  return ACT;
    case PIN_FLOAT:
    default:         return pulled_up;
    }
}

static void tick(int ms)
{
    for (int i = 0; i < ms; i++)
    {
        g_now++;
        for (uint8_t ch = 0U; ch < 2U; ch++)
        {
            uint8_t pu = g_probe ? g_pulled_up : 1U;
            MotorAlarmCore_Sample(ch, pin_level(g_pin[ch], pu), pu, g_probe, g_now);
        }
        if (g_probe) g_pulled_up ^= 1U;
    }
}

static MotorAlarmStatus st(uint8_t ch)
{
    MotorAlarmStatus s;
    memset(&s, 0xA5, sizeof(s));
    MotorAlarmCore_GetStatus(ch, &s);
    return s;
}

static void reset(uint8_t enabled, PinModel l, PinModel r)
{
    g_probe = 1U;
    g_pulled_up = 1U;
    g_pin[0] = l;
    g_pin[1] = r;
    MotorAlarmCore_Init(enabled);
}

static void test_boot_unknown_then_settles(void)
{
    printf("test_boot_unknown_then_settles\n");
    reset(1U, PIN_NORMAL, PIN_NORMAL);
    CHECK(st(0).state == MOTOR_ALARM_UNKNOWN && st(1).state == MOTOR_ALARM_UNKNOWN,
          "right after Init: UNKNOWN, not OK");
    tick(MOTOR_ALARM_DEBOUNCE_MS);
    CHECK(st(0).state == MOTOR_ALARM_UNKNOWN, "still UNKNOWN before a full debounce window");
    tick(2);
    CHECK(st(0).state == MOTOR_ALARM_OK && st(1).state == MOTOR_ALARM_OK,
          "both drivers normal -> OK after debounce");
    CHECK(st(0).trips == 0U && st(0).glitches == 0U, "no trips, no glitches");
    CHECK(st(0).last_change_ms != 0U, "change time recorded");
}

static void test_unwired_is_no_signal_never_alarm(void)
{
    printf("test_unwired_is_no_signal_never_alarm\n");
    reset(1U, PIN_FLOAT, PIN_FLOAT);
    uint8_t ever_ok_or_alarm = 0U;
    for (int i = 0; i < 2000; i++)
    {
        tick(1);
        uint8_t s = st(0).state;
        if (s == MOTOR_ALARM_OK || s == MOTOR_ALARM_ALARM) ever_ok_or_alarm = 1U;
    }
    CHECK(ever_ok_or_alarm == 0U, "floating pin never reads as OK or ALARM (2 s)");
    CHECK(st(0).state == MOTOR_ALARM_NO_SIGNAL && st(1).state == MOTOR_ALARM_NO_SIGNAL,
          "floating pins -> NO_SIGNAL");
    CHECK(st(0).raw_pu == 1U && st(0).raw_pd == 0U, "raw: follows pull-up / pull-down");
    CHECK(st(0).trips == 0U && st(1).trips == 0U, "no trip counted while unwired");
}

static void test_one_driver_alarm(void)
{
    printf("test_one_driver_alarm\n");
    reset(1U, PIN_NORMAL, PIN_NORMAL);
    tick(50);
    g_pin[0] = PIN_FAULT;
    uint32_t t_fault = g_now;
    tick(MOTOR_ALARM_DEBOUNCE_MS + 2);
    MotorAlarmStatus l = st(0), r = st(1);
    CHECK(l.state == MOTOR_ALARM_ALARM, "left fault -> left ALARM");
    CHECK(r.state == MOTOR_ALARM_OK, "right unaffected -> OK");
    CHECK(l.trips == 1U && r.trips == 0U, "trip counted on the left only");
    CHECK(l.last_trip_ms > t_fault && l.last_trip_ms <= g_now, "trip time recorded");
    CHECK(l.glitches == 0U, "a real fault is not a glitch");
    tick(500);
    CHECK(st(0).trips == 1U, "a sustained alarm counts once");
    g_pin[0] = PIN_NORMAL;      /* driver power-cycled / alarm cleared */
    tick(MOTOR_ALARM_DEBOUNCE_MS + 2);
    CHECK(st(0).state == MOTOR_ALARM_OK && st(0).trips == 1U,
          "alarm clears -> OK, trip counter keeps the history");
}

static void test_both_drivers_alarm(void)
{
    printf("test_both_drivers_alarm\n");
    reset(1U, PIN_NORMAL, PIN_NORMAL);
    tick(50);
    g_pin[0] = PIN_FAULT;
    g_pin[1] = PIN_FAULT;
    tick(MOTOR_ALARM_DEBOUNCE_MS + 2);
    CHECK(st(0).state == MOTOR_ALARM_ALARM && st(1).state == MOTOR_ALARM_ALARM,
          "both faults -> both ALARM");
    CHECK(st(0).trips == 1U && st(1).trips == 1U, "one trip each");
}

static void test_alarm_at_boot_counts(void)
{
    printf("test_alarm_at_boot_counts\n");
    reset(1U, PIN_FAULT, PIN_NORMAL);
    tick(MOTOR_ALARM_DEBOUNCE_MS + 2);
    CHECK(st(0).state == MOTOR_ALARM_ALARM && st(0).trips == 1U,
          "driver already in alarm at MCU boot -> ALARM, trips=1");
}

static void test_short_noise_is_filtered(void)
{
    printf("test_short_noise_is_filtered\n");
    reset(1U, PIN_NORMAL, PIN_NORMAL);
    tick(50);
    for (int burst = 0; burst < 5; burst++)
    {
        g_pin[0] = PIN_FAULT;
        tick(MOTOR_ALARM_DEBOUNCE_MS - 1);
        g_pin[0] = PIN_NORMAL;
        tick(30);
    }
    CHECK(st(0).state == MOTOR_ALARM_OK, "pulses shorter than the debounce never reach ALARM");
    CHECK(st(0).trips == 0U, "no trip from noise");
    CHECK(st(0).glitches == 5U, "each rejected pulse counted as a glitch");

    /* Single-sample spikes, and a 1-sample float (e.g. connector bounce). */
    g_pin[1] = PIN_FAULT; tick(1); g_pin[1] = PIN_NORMAL; tick(10);
    g_pin[1] = PIN_FLOAT; tick(1); g_pin[1] = PIN_NORMAL; tick(10);
    /* A 1 ms open reads like the pull-up under one of the two pulls, so it
     * is a glitch or invisible depending on the phase. */
    CHECK(st(1).state == MOTOR_ALARM_OK && st(1).trips == 0U &&
          st(1).glitches >= 1U && st(1).glitches <= 2U,
          "1 ms spike and a 1 ms open are filtered, state stays OK");
}

static void test_wire_break_while_running(void)
{
    printf("test_wire_break_while_running\n");
    reset(1U, PIN_NORMAL, PIN_NORMAL);
    tick(50);
    g_pin[1] = PIN_FLOAT;       /* 1k lead to PC11 breaks */
    tick(MOTOR_ALARM_DEBOUNCE_MS + 2);
    CHECK(st(1).state == MOTOR_ALARM_NO_SIGNAL && st(1).trips == 0U,
          "broken GPIO lead -> NO_SIGNAL, not ALARM");
}

static void test_reinit_is_mcu_reset(void)
{
    printf("test_reinit_is_mcu_reset\n");
    reset(1U, PIN_FAULT, PIN_FAULT);
    tick(100);
    CHECK(st(0).trips == 1U, "precondition: one trip");
    MotorAlarmCore_Init(1U);    /* what a reset does to RAM state */
    CHECK(st(0).state == MOTOR_ALARM_UNKNOWN && st(0).trips == 0U && st(0).glitches == 0U,
          "after reset: UNKNOWN, counters back to 0 (host sees counters go back)");
    tick(MOTOR_ALARM_DEBOUNCE_MS + 2);
    CHECK(st(0).state == MOTOR_ALARM_ALARM && st(0).trips == 1U,
          "a still-latched driver alarm is reported again after reset");
}

static void test_disabled(void)
{
    printf("test_disabled\n");
    reset(0U, PIN_FAULT, PIN_FLOAT);
    tick(200);
    CHECK(MotorAlarmCore_IsEnabled() == 0U, "IsEnabled()=0");
    CHECK(st(0).state == MOTOR_ALARM_DISABLED && st(1).state == MOTOR_ALARM_DISABLED,
          "disabled: DISABLED whatever the pins do");
    CHECK(st(0).trips == 0U, "disabled: no trips");
    CHECK(st(7).state == MOTOR_ALARM_DISABLED, "out-of-range channel reads DISABLED");
}

static void test_probe_off(void)
{
    printf("test_probe_off\n");
    reset(1U, PIN_NORMAL, PIN_FAULT);
    g_probe = 0U;
    tick(MOTOR_ALARM_DEBOUNCE_MS + 2);
    CHECK(st(0).state == MOTOR_ALARM_OK && st(1).state == MOTOR_ALARM_ALARM,
          "probe off: driven levels still classified");
    g_pin[0] = PIN_FLOAT;       /* fixed pull-up in the firmware when probe is off */
    tick(100);
    CHECK(st(0).state == (MOTOR_ALARM_ACTIVE_LEVEL ? MOTOR_ALARM_ALARM : MOTOR_ALARM_OK),
          "probe off: floating pin reads as the pull-up level (documented limit)");
}

static void test_state_text(void)
{
    printf("test_state_text\n");
    CHECK(strcmp(MotorAlarmCore_StateText(MOTOR_ALARM_NO_SIGNAL), "NO_SIGNAL") == 0 &&
          strcmp(MotorAlarmCore_StateText(MOTOR_ALARM_ALARM), "ALARM") == 0 &&
          strcmp(MotorAlarmCore_StateText(99U), "?") == 0, "state names");
    CHECK(MOTOR_ALARM_DISABLED == 0 && MOTOR_ALARM_UNKNOWN == 1 && MOTOR_ALARM_OK == 2 &&
          MOTOR_ALARM_ALARM == 3 && MOTOR_ALARM_NO_SIGNAL == 4,
          "wire codes match robot/docs/PROTOCOL_FB.md");
}

int main(void)
{
    printf("MOTOR_ALARM_ACTIVE_LEVEL=%u DEBOUNCE=%u ms\n",
           (unsigned)MOTOR_ALARM_ACTIVE_LEVEL, (unsigned)MOTOR_ALARM_DEBOUNCE_MS);
    test_boot_unknown_then_settles();
    test_unwired_is_no_signal_never_alarm();
    test_one_driver_alarm();
    test_both_drivers_alarm();
    test_alarm_at_boot_counts();
    test_short_noise_is_filtered();
    test_wire_break_while_running();
    test_reinit_is_mcu_reset();
    test_disabled();
    test_probe_off();
    test_state_text();
    CHECK(g_irq_disabled == 0, "critical sections balanced");
    if (g_fail == 0) { printf("\nTAT CA TEST PASS\n"); return 0; }
    printf("\n%d TEST FAIL\n", g_fail);
    return 1;
}
