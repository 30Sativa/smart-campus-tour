/**
 * Host test (gcc) cho Core/Src/head/head_core.c: profile hinh thang PAN/TILT.
 * HAL thay bang tests/stubs/main.h; ISR TIM6 duoc goi bang tick().
 * Moi tin hieu (STEP/DIR/nEN cua tung truc) co mot "port" gia rieng de doc
 * lai muc chan sau tung tick. Chay: ./scripts/verify.sh (ban thong so mac
 * dinh, va ban -DHEAD_MAX_SPEED_DPS=2000 -DHEAD_ACCEL_DPS2=20000 de cham tran
 * HEAD_MAX_STEP_HZ).
 */
#include "head/head_core.h"

#include <math.h>
#include <stdio.h>
#include <string.h>

static int g_fail = 0;
int g_irq_disabled = 0;

#define CHECK(cond, msg)                                                       \
    do {                                                                       \
        if (cond) { printf("  ok   %s\n", (msg)); }                            \
        else      { printf("  FAIL %s   (%s:%d)\n", (msg), __FILE__, __LINE__); g_fail++; } \
    } while (0)

/* ---- chan gia ----------------------------------------------------------- */
enum { SIG_STEP = 0, SIG_DIR, SIG_EN, SIG_COUNT };
static GPIO_TypeDef g_port[HEAD_AXIS_COUNT][SIG_COUNT];
static int g_level[HEAD_AXIS_COUNT][SIG_COUNT];

typedef struct
{
	long ticks;
	long edges;            /* canh len STEP */
	long dir_changes;
	long steps_fwd, steps_rev;
	long bad_pulse;        /* cao != 1 tick, hoac thap < 1 tick */
	long step_on_dir_tick; /* canh STEP cung tick voi lan doi DIR */
	long high_run, low_run;
	int32_t max_pos, min_pos;
} AxisLog;
static AxisLog g_log[HEAD_AXIS_COUNT];

/* Truc co khi gia lap: vi tri THAT (buoc, tinh tu 0 do that) va mot vat can
 * o HOME_DIR * offset. Buoc nao day truc vuot vat can thi bi mat (motor buoc
 * truot tai cho), dung nhu ngoai doi. */
static int g_phys_on = 0;
static int32_t g_phys[HEAD_AXIS_COUNT];
static int32_t g_stop[HEAD_AXIS_COUNT];     /* canh vat can phia homing, co dau */
static int32_t g_wall[HEAD_AXIS_COUNT];     /* canh con lai (phia doi dien), co dau; 0 = khong co */
static long g_lost[HEAD_AXIS_COUNT];
static uint32_t g_ms = 0U;

/* Mo hinh roto sat thuc te hon (test_homing_repeatable_rotor_model): vi tri
 * roto g_x (don vi xung, 0 = 0 do that, so thuc) chi nam yen o vi tri can bang
 * cua pha dien hien tai = g_cmd + g_c0 + k * chu ky (chu ky = 4 buoc du).
 * Moi xung, roto toi vi tri can bang GAN NHAT cua pha moi; vat can chan
 * [g_s, g_w] thi roto bi ep tai vat can. Can bang gan nhat nhay khac +/-1 =
 * truot pha (mat buoc). g_c0: lech pha co dinh giua bo dem buoc cua driver
 * va rang roto (hang so vat ly cua tung motor). */
static int g_rotor_on = 0;
static double g_x[HEAD_AXIS_COUNT];
static long g_cmd[HEAD_AXIS_COUNT];
static long g_c0[HEAD_AXIS_COUNT];
static double g_s[HEAD_AXIS_COUNT], g_w[HEAD_AXIS_COUNT];
static long g_slip[HEAD_AXIS_COUNT];
#define PHASE_PERIOD ((long)(4.0f * HEAD_MICROSTEP + 0.5f))

static void rotor_settle(int a)
{
	double q = (double)(g_cmd[a] + g_c0[a]);
	double k = floor((g_x[a] - q) / (double)PHASE_PERIOD + 0.5);
	double e = q + k * (double)PHASE_PERIOD;
	if (e < g_s[a]) e = g_s[a];
	if (e > g_w[a]) e = g_w[a];
	g_x[a] = e;
}

static const HeadAxisPins PAN_PINS  = { &g_port[0][SIG_STEP], 1U, &g_port[0][SIG_DIR], 1U, 0U, &g_port[0][SIG_EN], 1U };
static const HeadAxisPins TILT_PINS = { &g_port[1][SIG_STEP], 1U, &g_port[1][SIG_DIR], 1U, 0U, &g_port[1][SIG_EN], 1U };

/* Doc mot lan ghi BSRR (moi port toi da mot lan ghi moi tick). */
static int apply(int axis, int sig)
{
	uint32_t v = g_port[axis][sig].BSRR;
	int changed = 0;
	if (v & 1U)          { changed = (g_level[axis][sig] != 1); g_level[axis][sig] = 1; }
	if (v & (1U << 16U)) { changed = (g_level[axis][sig] != 0); g_level[axis][sig] = 0; }
	g_port[axis][sig].BSRR = 0U;
	return changed;
}

static void sync_pins(void)
{
	for (int a = 0; a < (int)HEAD_AXIS_COUNT; a++)
		for (int s = 0; s < SIG_COUNT; s++) (void)apply(a, s);
}

static void tick(void)
{
	HeadCore_HandleTick();
	for (int a = 0; a < (int)HEAD_AXIS_COUNT; a++)
	{
		AxisLog *L = &g_log[a];
		int was_high = g_level[a][SIG_STEP];
		int dir_changed = apply(a, SIG_DIR);
		(void)apply(a, SIG_EN);
		(void)apply(a, SIG_STEP);
		int high = g_level[a][SIG_STEP];
		L->ticks++;
		if (dir_changed) L->dir_changes++;
		if (high && !was_high)
		{
			L->edges++;
			if (dir_changed) L->step_on_dir_tick++;
			if (L->low_run < 1) L->bad_pulse++;
			if (g_level[a][SIG_DIR]) L->steps_fwd++; else L->steps_rev++;
			if (g_rotor_on)
			{
				double before = g_x[a];
				double free = before + (g_level[a][SIG_DIR] ? 1.0 : -1.0);
				g_cmd[a] += g_level[a][SIG_DIR] ? 1 : -1;
				rotor_settle(a);
				if (fabs(g_x[a] - free) > 1e-9) g_slip[a]++;
			}
			if (g_phys_on)
			{
				int32_t next = g_phys[a] + (g_level[a][SIG_DIR] ? 1 : -1);
				int beyond = (g_stop[a] > 0) ? (next > g_stop[a]) : (next < g_stop[a]);
				if (g_wall[a] != 0)
					beyond |= (g_wall[a] > 0) ? (next > g_wall[a]) : (next < g_wall[a]);
				if (beyond) g_lost[a]++; else g_phys[a] = next;
			}
			L->high_run = 0;
		}
		if (high) { L->high_run++; if (L->high_run > 1) L->bad_pulse++; L->low_run = 0; }
		else      { L->low_run++; }
		int32_t p = HeadCore_GetPositionSteps((uint8_t)a);
		if (p > L->max_pos) L->max_pos = p;
		if (p < L->min_pos) L->min_pos = p;
	}
}

static void ticks(long n) { for (long i = 0; i < n; i++) tick(); }

/* 1 ms = 10 tick ISR + 1 lan main loop (HeadCore_Service). */
static void run_ms(long ms)
{
	for (long i = 0; i < ms; i++)
	{
		ticks(HEAD_TICK_HZ / 1000);
		g_ms++;
		HeadCore_Service(g_ms);
	}
}

static long run_ms_until_state_not(HeadState st_not, long max_ms)
{
	HeadStatus st;
	for (long i = 0; i < max_ms; i++)
	{
		run_ms(1);
		HeadCore_GetStatus(&st);
		if (st.state != st_not) return i + 1;
	}
	return -1;
}

static int32_t cdeg_steps(uint8_t axis, int32_t cdeg)
{
	return (int32_t)lroundf((float)cdeg * HeadCore_StepsPerCdeg(axis));
}

/* Chay toi khi IDLE (hoac het gioi han). Tra ve so tick da chay. */
static long run_until_idle(long max_ticks)
{
	HeadStatus st;
	for (long i = 0; i < max_ticks; i++)
	{
		tick();
		HeadCore_GetStatus(&st);
		if (st.state != HEAD_STATE_MOVING) return i + 1;
	}
	return -1;
}

/* Chay toi khi truc PAN di duoc it nhat n buoc (khong phu thuoc thong so). */
static void run_until_pan(int32_t n)
{
	for (long i = 0; i < 20L * HEAD_TICK_HZ; i++)
	{
		if (HeadCore_GetPositionSteps(HEAD_AXIS_PAN) >= n) return;
		tick();
	}
}

static void clear_log(void)
{
	memset(g_log, 0, sizeof(g_log));
	for (int a = 0; a < (int)HEAD_AXIS_COUNT; a++) { g_log[a].low_run = 1; g_log[a].max_pos = g_log[a].min_pos = HeadCore_GetPositionSteps((uint8_t)a); }
}

static void reset(void)
{
	memset(g_port, 0, sizeof(g_port));
	memset(g_level, 0, sizeof(g_level));
	HeadCore_Init(&PAN_PINS, &TILT_PINS);
	sync_pins();
	clear_log();
}

static float steps_per_deg(uint8_t axis) { return HeadCore_StepsPerCdeg(axis) * 100.0f; }
static float max_sps(uint8_t axis)
{
	float v = HEAD_MAX_SPEED_DPS * steps_per_deg(axis);
	return (v > HEAD_MAX_STEP_HZ) ? HEAD_MAX_STEP_HZ : v;
}
static float accel_sps2(uint8_t axis) { return HEAD_ACCEL_DPS2 * steps_per_deg(axis); }

/* ---- tests -------------------------------------------------------------- */
static void test_boot_is_disabled(void)
{
	printf("test_boot_is_disabled\n");
	reset();
	CHECK(g_level[0][SIG_EN] == 1 && g_level[1][SIG_EN] == 1, "boot: nEN high on both drivers (disabled)");
	CHECK(HeadCore_Command(1000, 0) == HEAD_ERR_NOT_ZEROED, "HEAD before ZERO is rejected");
	ticks(10000);
	CHECK(g_log[0].edges == 0 && g_log[1].edges == 0, "no STEP pulses while disabled");
	HeadStatus st; HeadCore_GetStatus(&st);
	CHECK(st.state == HEAD_STATE_OFF && st.zeroed == 0U, "status OFF, not zeroed");
}

static void test_zero_enables_and_move_exact(void)
{
	printf("test_zero_enables_and_move_exact\n");
	reset();
	CHECK(HeadCore_Zero() == HEAD_OK, "ZERO accepted");
	sync_pins();
	CHECK(g_level[0][SIG_EN] == 0 && g_level[1][SIG_EN] == 0, "ZERO drives nEN low (drivers hold torque)");
	clear_log();
	CHECK(HeadCore_Command(9000, 0) == HEAD_OK, "HEAD pan=90.00 deg accepted");
	int32_t target = HeadCore_GetTargetSteps(HEAD_AXIS_PAN);
	CHECK(target == (int32_t)lroundf(9000.0f * HeadCore_StepsPerCdeg(HEAD_AXIS_PAN)), "target = round(cdeg * steps/cdeg)");
	long t = run_until_idle(20L * HEAD_TICK_HZ);
	CHECK(t > 0, "move finishes (state back to IDLE)");
	CHECK(HeadCore_GetPositionSteps(HEAD_AXIS_PAN) == target, "final position == target exactly");
	CHECK(g_log[0].edges == target && g_log[0].steps_rev == 0, "edge count == distance, all forward");
	CHECK(g_log[0].max_pos == target, "never overshoots the target");
	CHECK(g_log[0].bad_pulse == 0, "STEP high exactly 1 tick, low >= 1 tick");
	CHECK(g_log[1].edges == 0, "TILT did not move");

	/* Thoi gian ly thuyet hinh thang (hoac tam giac neu quang ngan). */
	float d = (float)target, a = accel_sps2(0), v = max_sps(0);
	float t_theory = (d >= v * v / a) ? (d / v + v / a) : (2.0f * sqrtf(d / a));
	float t_meas = (float)t / (float)HEAD_TICK_HZ;
	printf("       distance %ld steps, %.3f s measured vs %.3f s theory\n", (long)target, t_meas, t_theory);
	CHECK(t_meas > 0.9f * t_theory && t_meas < 1.15f * t_theory, "duration within -10%/+15% of trapezoid theory");

	HeadStatus st; HeadCore_GetStatus(&st);
	CHECK(st.state == HEAD_STATE_IDLE && st.pan_cdeg == 9000 && st.tilt_cdeg == 0, "status IDLE, pan reported 9000 cdeg");
}

static void test_speed_and_accel_limits(void)
{
	printf("test_speed_and_accel_limits\n");
	reset(); (void)HeadCore_Zero(); sync_pins(); clear_log();
	(void)HeadCore_Command(HEAD_PAN_LIMIT_CDEG, 0);
	/* 100 ms dau: x = a t^2 / 2 */
	ticks(HEAD_TICK_HZ / 10);
	float first = 0.5f * accel_sps2(0) * 0.01f;
	CHECK((float)g_log[0].edges <= first + 3.0f, "first 100 ms follows the acceleration ramp");
	/* cua so 100 ms bat ky khong vuot max_sps */
	long worst = 0;
	for (int w = 0; w < 20; w++)
	{
		long before = g_log[0].edges;
		ticks(HEAD_TICK_HZ / 10);
		long n = g_log[0].edges - before;
		if (n > worst) worst = n;
	}
	printf("       worst 100 ms window: %ld steps, limit %.1f\n", worst, max_sps(0) * 0.1f);
	CHECK((float)worst <= max_sps(0) * 0.1f + 2.0f, "no 100 ms window exceeds max speed");
	CHECK(g_log[0].bad_pulse == 0, "pulse timing holds at cruise speed");
}

static void test_limits_rejected(void)
{
	printf("test_limits_rejected\n");
	reset(); (void)HeadCore_Zero();
	CHECK(HeadCore_Command(HEAD_PAN_LIMIT_CDEG + 1, 0) == HEAD_ERR_LIMIT, "pan beyond limit rejected");
	CHECK(HeadCore_Command(0, -(HEAD_TILT_LIMIT_CDEG + 1)) == HEAD_ERR_LIMIT, "tilt beyond limit rejected");
	CHECK(HeadCore_GetTargetSteps(HEAD_AXIS_PAN) == 0 && HeadCore_GetTargetSteps(HEAD_AXIS_TILT) == 0, "rejected command leaves targets unchanged");
	CHECK(HeadCore_Command(-HEAD_PAN_LIMIT_CDEG, HEAD_TILT_LIMIT_CDEG) == HEAD_OK, "exact limits accepted");
}

static void test_reverse_mid_move(void)
{
	printf("test_reverse_mid_move\n");
	reset(); (void)HeadCore_Zero(); sync_pins(); clear_log();
	(void)HeadCore_Command(9000, 0);
	run_until_pan(HeadCore_GetTargetSteps(HEAD_AXIS_PAN) / 2);   /* dang chay deu */
	int32_t at_cmd = HeadCore_GetPositionSteps(HEAD_AXIS_PAN);
	long dir_before = g_log[0].dir_changes;
	(void)HeadCore_Command(0, 0);                 /* quay ve */
	long t = run_until_idle(20L * HEAD_TICK_HZ);
	CHECK(t > 0, "reversal finishes");
	CHECK(HeadCore_GetPositionSteps(HEAD_AXIS_PAN) == 0, "ends exactly at the new target");
	CHECK(g_log[0].max_pos > at_cmd, "decelerates forward first instead of stopping dead");
	float decel = max_sps(0) * max_sps(0) / (2.0f * accel_sps2(0));
	CHECK((float)(g_log[0].max_pos - at_cmd) <= decel + 3.0f, "overshoot past command point ~ v^2/2a");
	CHECK(g_log[0].dir_changes - dir_before == 1, "DIR changes exactly once");
	CHECK(g_log[0].step_on_dir_tick == 0, "no STEP edge on the tick DIR changed");
	CHECK(g_log[0].steps_fwd - g_log[0].steps_rev == 0, "forward and reverse edges balance (net 0)");
	CHECK(g_log[0].bad_pulse == 0, "pulse timing holds through reversal");
}

static void test_halt_decelerates(void)
{
	printf("test_halt_decelerates\n");
	reset(); (void)HeadCore_Zero(); sync_pins(); clear_log();
	(void)HeadCore_Command(HEAD_PAN_LIMIT_CDEG, 0);
	run_until_pan(HeadCore_GetTargetSteps(HEAD_AXIS_PAN) / 4);
	int32_t at_halt = HeadCore_GetPositionSteps(HEAD_AXIS_PAN);
	HeadCore_Halt();
	long t = run_until_idle(10L * HEAD_TICK_HZ);
	int32_t travel = HeadCore_GetPositionSteps(HEAD_AXIS_PAN) - at_halt;
	float decel = max_sps(0) * max_sps(0) / (2.0f * accel_sps2(0));
	printf("       stopped %ld steps after HALT (v^2/2a = %.1f)\n", (long)travel, decel);
	CHECK(t > 0 && travel > 0, "keeps moving briefly (ramped stop)");
	CHECK((float)travel <= decel + 3.0f, "stops within stopping distance");
	HeadStatus st; HeadCore_GetStatus(&st);
	CHECK(st.state == HEAD_STATE_IDLE && st.zeroed == 1U, "after HALT: IDLE, still zeroed, drivers on");
}

static void test_off_drops_reference(void)
{
	printf("test_off_drops_reference\n");
	reset(); (void)HeadCore_Zero(); sync_pins(); clear_log();
	(void)HeadCore_Command(9000, 1500);
	run_until_pan(HeadCore_GetTargetSteps(HEAD_AXIS_PAN) / 4);
	CHECK(HeadCore_Zero() == HEAD_ERR_BUSY, "ZERO while moving is rejected");
	HeadCore_Off();
	sync_pins();
	long edges = g_log[0].edges + g_log[1].edges;
	ticks(HEAD_TICK_HZ);
	CHECK(g_log[0].edges + g_log[1].edges == edges, "OFF stops STEP pulses immediately");
	CHECK(g_level[0][SIG_EN] == 1 && g_level[1][SIG_EN] == 1, "OFF drives nEN high");
	CHECK(g_level[0][SIG_STEP] == 0 && g_level[1][SIG_STEP] == 0, "STEP left low");
	HeadStatus st; HeadCore_GetStatus(&st);
	CHECK(st.state == HEAD_STATE_OFF && st.zeroed == 0U, "status OFF and reference lost");
	CHECK(HeadCore_Command(0, 0) == HEAD_ERR_NOT_ZEROED, "HEAD after OFF needs a new ZERO");
	CHECK(HeadCore_Zero() == HEAD_OK, "ZERO allowed again while OFF");
}

static void test_both_axes_together(void)
{
	printf("test_both_axes_together\n");
	reset(); (void)HeadCore_Zero(); sync_pins(); clear_log();
	(void)HeadCore_Command(-4500, -1500);
	long t = run_until_idle(20L * HEAD_TICK_HZ);
	int32_t pt = (int32_t)lroundf(-4500.0f * HeadCore_StepsPerCdeg(HEAD_AXIS_PAN));
	int32_t tt = (int32_t)lroundf(-1500.0f * HeadCore_StepsPerCdeg(HEAD_AXIS_TILT));
	CHECK(t > 0, "both axes finish");
	CHECK(HeadCore_GetPositionSteps(HEAD_AXIS_PAN) == pt && HeadCore_GetPositionSteps(HEAD_AXIS_TILT) == tt, "both at their own targets (negative direction)");
	CHECK(g_log[0].steps_fwd == 0 && g_log[1].steps_fwd == 0, "all edges in the negative direction");
	CHECK(g_level[0][SIG_DIR] == 0 && g_level[1][SIG_DIR] == 0, "DIR low for negative direction (no invert)");
	CHECK(g_log[0].bad_pulse == 0 && g_log[1].bad_pulse == 0, "pulse timing holds on both axes");
	HeadStatus st; HeadCore_GetStatus(&st);
	float half_step_cdeg = 0.5f / HeadCore_StepsPerCdeg(HEAD_AXIS_TILT);
	CHECK(st.pan_cdeg == -4500 && fabsf((float)st.tilt_cdeg + 1500.0f) <= half_step_cdeg + 1.0f,
	      "status reports both angles in cdeg (within half a step)");
}

static void test_sub_step_command(void)
{
	printf("test_sub_step_command\n");
	reset(); (void)HeadCore_Zero(); sync_pins(); clear_log();
	float half_step_cdeg = 0.4f / HeadCore_StepsPerCdeg(HEAD_AXIS_PAN);
	(void)HeadCore_Command((int32_t)half_step_cdeg, 0);
	ticks(HEAD_TICK_HZ / 10);
	CHECK(g_log[0].edges == 0, "command smaller than half a step produces no pulse");
	HeadStatus st; HeadCore_GetStatus(&st);
	CHECK(st.state == HEAD_STATE_IDLE, "and status stays IDLE");
}

static void phys_setup(int32_t pan_start_cdeg, int32_t tilt_start_cdeg)
{
	g_phys_on = 1;
	g_stop[0] = HEAD_PAN_HOME_DIR * cdeg_steps(0, HEAD_PAN_HOME_OFFSET_CDEG);
	g_stop[1] = HEAD_TILT_HOME_DIR * cdeg_steps(1, HEAD_TILT_HOME_OFFSET_CDEG);
	/* PAN: khoi vat can o phia sau, hai canh doi xung o +/-174 do.
	 * TILT: vat can cui 20 do; gia lap them vat can ngua doi xung 20 do. */
	g_wall[0] = -HEAD_PAN_HOME_DIR * cdeg_steps(0, HEAD_PAN_HOME_OFFSET_CDEG);
	g_wall[1] = -HEAD_TILT_HOME_DIR * cdeg_steps(1, HEAD_TILT_HOME_OFFSET_CDEG);
	g_phys[0] = cdeg_steps(0, pan_start_cdeg);
	g_phys[1] = cdeg_steps(1, tilt_start_cdeg);
	g_lost[0] = g_lost[1] = 0;
}

static void test_homing_against_hard_stop(void)
{
	printf("test_homing_against_hard_stop\n");
	/* Vi tri xuat phat that, centi-do tu 0 do that.
	 * PAN: goc that (duong = trai). Seek 190 do sang phai chi toi duoc canh
	 * vat can (174 do phai) khi dau dang trong [174 phai .. 16 trai]:
	 * -17300 = sat canh homing; +1200 = gan bien trai cua khoang do.
	 * TILT: goc that (duong = ngua len), vat can cui 20 do. -1900 = sat vat
	 * can; +1900 = ngua het, xa vat can nhat (39 do). */
	static const int32_t starts[][2] = {
		{ 0, 0 }, { 1200, -1500 }, { -9000, 1800 }, { -17300, -1900 }, { 600, 1900 }
	};
	for (unsigned k = 0; k < sizeof(starts) / sizeof(starts[0]); k++)
	{
		char msg[128];
		reset();
		phys_setup(starts[k][0], starts[k][1]);
		CHECK(HeadCore_Home() == HEAD_OK, "HOME accepted from OFF");
		sync_pins();
		HeadStatus st; HeadCore_GetStatus(&st);
		CHECK(st.state == HEAD_STATE_HOMING, "state HOMING");
		CHECK(HeadCore_Command(0, 0) == HEAD_ERR_BUSY && HeadCore_Step(1, 0) == HEAD_ERR_BUSY &&
		      HeadCore_Jog(1, 0, g_ms) == HEAD_ERR_BUSY && HeadCore_Zero() == HEAD_ERR_BUSY &&
		      HeadCore_Home() == HEAD_ERR_BUSY,
		      "every motion command is BUSY during homing");
		long t = run_ms_until_state_not(HEAD_STATE_HOMING, 120000);
		HeadCore_GetStatus(&st);
		printf("       start pan %6.1f / tilt %6.1f deg -> homed in %5.1f s, lost steps at stop pan %ld tilt %ld\n",
		       starts[k][0] / 100.0, starts[k][1] / 100.0, t / 1000.0, g_lost[0], g_lost[1]);
		snprintf(msg, sizeof msg, "start %ld/%ld: homing finishes, IDLE with reference",
		         (long)starts[k][0], (long)starts[k][1]);
		CHECK(t > 0 && st.state == HEAD_STATE_IDLE && st.zeroed == 1U, msg);
		CHECK(g_phys[0] == 0 && g_phys[1] == 0, "both axes PHYSICALLY at true 0 deg");
		CHECK(HeadCore_GetPositionSteps(0) == 0 && HeadCore_GetPositionSteps(1) == 0, "and the firmware agrees (0 steps)");
		CHECK(g_lost[0] > 0 && g_lost[1] > 0, "the seek really pressed into the stop (lost steps)");
	}
	/* Sau homing chay binh thuong khong bao gio cham vat can. */
	(void)HeadCore_Command(HEAD_PAN_LIMIT_CDEG, HEAD_TILT_LIMIT_CDEG);
	run_ms(30000);
	long lost = g_lost[0] + g_lost[1];
	(void)HeadCore_Command(-HEAD_PAN_LIMIT_CDEG, -HEAD_TILT_LIMIT_CDEG);
	run_ms(30000);
	CHECK(g_lost[0] + g_lost[1] == lost, "moving between the soft limits never hits the stop");
	CHECK(g_phys[0] == HeadCore_GetPositionSteps(0) && g_phys[1] == HeadCore_GetPositionSteps(1), "physical == counted position after limit-to-limit moves");
	g_phys_on = 0;
}

/* HOME voi mo hinh roto truot pha (xem g_rotor_on): moc 0 phai LAP LAI dung
 * mot vi tri du dau xuat phat o dau, lech khoi vi tri ly tuong < 2 buoc du,
 * va chay giua hai gioi han mem sau do khong bao gio truot buoc. */
static void test_homing_repeatable_rotor_model(void)
{
	printf("test_homing_repeatable_rotor_model\n");
	const double micro = (double)HEAD_MICROSTEP;
	const int32_t offset_cdeg[HEAD_AXIS_COUNT] = { HEAD_PAN_HOME_OFFSET_CDEG, HEAD_TILT_HOME_OFFSET_CDEG };
	const int home_dir[HEAD_AXIS_COUNT] = { HEAD_PAN_HOME_DIR, HEAD_TILT_HOME_DIR };
	const int32_t limit_cdeg[HEAD_AXIS_COUNT] = { HEAD_PAN_LIMIT_CDEG, HEAD_TILT_LIMIT_CDEG };
	static const int32_t starts[][2] = { { 0, 0 }, { 1200, 1900 }, { -9000, -1700 }, { -17300, 900 } };
	const long n_starts = (long)(sizeof(starts) / sizeof(starts[0]));
	long c0_stride = PHASE_PERIOD / 8; if (c0_stride < 1) c0_stride = 1;
	int all_repeat = 1, all_close = 1, all_noslip = 1;
	long pressed_runs = 0;
	double worst_err[HEAD_AXIS_COUNT] = { 0.0, 0.0 };

	for (long c0 = 0; c0 < PHASE_PERIOD; c0 += c0_stride)
	{
		double first[HEAD_AXIS_COUNT] = { 0.0, 0.0 };
		double first_err[HEAD_AXIS_COUNT] = { 0.0, 0.0 };
		/* Mot lan cap nguon (driver + STM32) roi HOME nhieu lan: giua cac lan,
		 * dau chay lenh khac, bi OFF va bi xoay tay toi cho moi. Bo dem buoc
		 * cua driver KHONG reset giua cac lan, giong ngoai doi. */
		reset();
		g_rotor_on = 1;
		for (int a = 0; a < (int)HEAD_AXIS_COUNT; a++) g_cmd[a] = 0;
		for (long k = 0; k < n_starts; k++)
		{
			if (k > 0) { HeadCore_Off(); sync_pins(); }
			for (int a = 0; a < (int)HEAD_AXIS_COUNT; a++)
			{
				/* Vat can that nam le 0.37 buoc du so voi luoi buoc (khong bao
				 * gio trung khit), firmware tinh offset bang so buoc lam tron. */
				double stop = (double)offset_cdeg[a] * (double)HeadCore_StepsPerCdeg((uint8_t)a) + 0.37 * micro;
				g_s[a] = -stop; g_w[a] = stop;    /* hai canh doi xung */
				g_c0[a] = c0 + a; g_slip[a] = 0;
				g_x[a] = (double)starts[k][a] * (double)HeadCore_StepsPerCdeg((uint8_t)a) + 0.21 * micro;
			}
			CHECK(HeadCore_Home() == HEAD_OK, "HOME accepted");
			sync_pins();
			for (int a = 0; a < (int)HEAD_AXIS_COUNT; a++) rotor_settle(a);   /* driver bat: roto hut ve can bang */
			long t = run_ms_until_state_not(HEAD_STATE_HOMING, 120000);
			HeadStatus st; HeadCore_GetStatus(&st);
			if (t <= 0 || st.state != HEAD_STATE_IDLE) { CHECK(0, "homing finishes"); continue; }
			for (int a = 0; a < (int)HEAD_AXIS_COUNT; a++)
			{
				/* Neu offset firmware = khoang cach that, 0 do ly tuong o day: */
				double fw_stop = (double)lroundf((float)offset_cdeg[a] * HeadCore_StepsPerCdeg((uint8_t)a));
				double ideal = (home_dir[a] < 0) ? (g_s[a] + fw_stop) : (g_w[a] - fw_stop);
				double err = g_x[a] - ideal;
				if (fabs(err) > worst_err[a]) worst_err[a] = fabs(err);
				if (fabs(err) > 2.0 * micro + 1e-9) all_close = 0;
				if (k == 0) { first[a] = g_x[a]; first_err[a] = err; }
				else if (fabs(g_x[a] - first[a]) > 1e-9) all_repeat = 0;
			}
			/* Chay toi hai gioi han mem: khong duoc truot buoc. */
			long slip0 = g_slip[0] + g_slip[1];
			double x0[2] = { g_x[0], g_x[1] };
			(void)HeadCore_Command(limit_cdeg[0], limit_cdeg[1]);
			(void)run_ms_until_state_not(HEAD_STATE_MOVING, 20000);
			(void)HeadCore_Command(-limit_cdeg[0], -limit_cdeg[1]);
			(void)run_ms_until_state_not(HEAD_STATE_MOVING, 20000);
			(void)HeadCore_Command(0, 0);
			(void)run_ms_until_state_not(HEAD_STATE_MOVING, 20000);
			/* Ep nhe vao vat can (< 2 buoc du) khong mat goc: roto quay lai dung
			 * cho cu. Mat goc = ve 0 xong ma roto khong con o cho cu. */
			if (g_slip[0] + g_slip[1] != slip0) pressed_runs++;
			if (fabs(g_x[0] - x0[0]) > 1e-9 || fabs(g_x[1] - x0[1]) > 1e-9)
				all_noslip = 0;
			/* Mot lenh bat ky truoc lan OFF ke tiep: pha bo dem doi. */
			(void)HeadCore_Command((int32_t)(1300 * (k + 1)), (int32_t)(-500 * (k + 1)));
			(void)run_ms_until_state_not(HEAD_STATE_MOVING, 20000);
		}
		printf("       driver phase c0 %3ld: zero lands PAN %+6.2f / TILT %+6.2f full steps from ideal\n",
		       c0, first_err[0] / micro, first_err[1] / micro);
	}
	g_rotor_on = 0;
	printf("       worst homing error: PAN %.2f deg, TILT %.2f deg (truoc hieu chinh HOME_OFFSET)\n",
	       worst_err[0] / (HeadCore_StepsPerCdeg(0) * 100.0), worst_err[1] / (HeadCore_StepsPerCdeg(1) * 100.0));
	printf("       runs touching a stop at the soft limit: %ld (lightly pressed, no loss)\n", pressed_runs);
#if HEAD_HOME_PHASE_ALIGN
	CHECK(all_repeat, "same rotor position after HOME from every start (repeatable zero)");
#else
	printf("       (HEAD_HOME_PHASE_ALIGN=0: repeatable=%d, not checked)\n", all_repeat);
#endif
	CHECK(all_close, "homed zero within 2 full steps of the ideal zero");
	CHECK(all_noslip, "limit-to-limit moves after HOME lose no angle (rotor returns exactly)");
}

static void test_homing_abort(void)
{
	printf("test_homing_abort\n");
	reset();
	(void)HeadCore_Home(); sync_pins();
	run_ms(2000);
	HeadCore_Halt();
	long t = run_ms_until_state_not(HEAD_STATE_MOVING, 5000);
	HeadStatus st; HeadCore_GetStatus(&st);
	(void)t;
	CHECK(st.state == HEAD_STATE_NO_REF && st.zeroed == 0U, "STOP during HOME -> NO_REF (drivers on, no reference)");
	CHECK(g_level[0][SIG_EN] == 0, "drivers stay enabled (holding)");
	CHECK(HeadCore_Command(0, 0) == HEAD_ERR_NOT_ZEROED && HeadCore_Step(1, 0) == HEAD_ERR_NOT_ZEROED &&
	      HeadCore_Jog(1, 0, g_ms) == HEAD_ERR_NOT_ZEROED, "motion rejected until a new HOME");
	CHECK(HeadCore_Home() == HEAD_OK, "HOME again accepted");
}

static void test_step_taps(void)
{
	printf("test_step_taps\n");
	reset(); (void)HeadCore_Zero(); sync_pins(); clear_log();
	const int32_t micro = (int32_t)HEAD_MICROSTEP;
	CHECK(HeadCore_Step(1, 0) == HEAD_OK, "tap PAN +1");
	run_ms(500);
	CHECK(HeadCore_GetPositionSteps(0) == micro && g_log[0].edges == micro, "one tap = one full motor step (HEAD_MICROSTEP pulses)");
	HeadStatus st; HeadCore_GetStatus(&st);
	printf("       one PAN tap = %.2f deg, one TILT tap = %.2f deg at the output shaft\n",
	       micro / (HeadCore_StepsPerCdeg(0) * 100.0f), micro / (HeadCore_StepsPerCdeg(1) * 100.0f));
	(void)HeadCore_Step(0, -1); run_ms(500);
	CHECK(HeadCore_GetPositionSteps(1) == -micro, "tap TILT -1");
	for (int i = 0; i < 5; i++) { (void)HeadCore_Step(1, 0); run_ms(2); }   /* 5 nhan nhanh */
	run_ms(1000);
	CHECK(HeadCore_GetPositionSteps(0) == 6 * micro, "5 fast taps accumulate (total 6 steps)");
	(void)HeadCore_Step(100000, 0); run_ms(20000);
	int32_t lim = cdeg_steps(0, HEAD_PAN_LIMIT_CDEG);
	CHECK(HeadCore_GetPositionSteps(0) == lim, "huge tap clamps at the soft limit");
	CHECK(g_log[0].bad_pulse == 0, "pulse timing holds");
}

static void test_jog_hold_and_deadman(void)
{
	printf("test_jog_hold_and_deadman\n");
	reset(); (void)HeadCore_Zero(); sync_pins(); clear_log();
	float jog_sps = HEAD_JOG_SPEED_DPS * HeadCore_StepsPerCdeg(0) * 100.0f;
	for (int i = 0; i < 20; i++) { (void)HeadCore_Jog(1, 0, g_ms); run_ms(100); }   /* giu nut 2 s */
	long before = g_log[0].edges; run_ms(100); long n = g_log[0].edges - before;
	printf("       while held: %ld steps / 100 ms (jog %.0f steps/s)\n", n, jog_sps);
	CHECK(n >= (long)(jog_sps * 0.1f) - 3, "held: still moving at jog speed");
	/* Nha nut ma lenh JOG,0,0 bi mat: chi con deadman. Lan JOG cuoi cach day 100 ms. */
	int32_t at_last = HeadCore_GetPositionSteps(0);
	long t = run_ms_until_state_not(HEAD_STATE_MOVING, 3000);
	int32_t extra = HeadCore_GetPositionSteps(0) - at_last;
	float bound = jog_sps * (HEAD_JOG_TIMEOUT_MS / 1000.0f) + jog_sps * jog_sps / (2.0f * HEAD_ACCEL_DPS2 * HeadCore_StepsPerCdeg(0) * 100.0f) + 5.0f;
	printf("       keepalives stop -> halted after %ld ms, %ld more steps (bound %.0f)\n", t, (long)extra, bound);
	CHECK(t > 0 && (float)extra <= bound, "deadman: stops by itself shortly after keepalives stop");
	HeadStatus st; HeadCore_GetStatus(&st);
	CHECK(st.state == HEAD_STATE_IDLE && st.zeroed == 1U, "IDLE, reference kept");

	(void)HeadCore_Jog(0, -1, g_ms); run_ms(500);
	(void)HeadCore_Jog(0, 0, g_ms);                      /* nha nut binh thuong */
	long t2 = run_ms_until_state_not(HEAD_STATE_MOVING, 1000);
	CHECK(t2 > 0 && t2 < 400, "JOG,0,0 (release) halts promptly");

	/* Truoc hai test duoi: dua PAN ve 0 de co du cho chay (giai doc lap voi
	 * gioi han dang cau hinh). */
	(void)HeadCore_Command(0, 0); (void)run_ms_until_state_not(HEAD_STATE_MOVING, 20000);
	int32_t lim0 = cdeg_steps(0, HEAD_PAN_LIMIT_CDEG);
	int32_t micro0 = (int32_t)HEAD_MICROSTEP;
	float decel0 = jog_sps * jog_sps / (2.0f * HEAD_ACCEL_DPS2 * HeadCore_StepsPerCdeg(0) * 100.0f);

	/* Dang giu PAN thi nhan TILT 1 buoc: PAN van phai con deadman. */
	int32_t p_before = HeadCore_GetPositionSteps(0);
	(void)HeadCore_Jog(1, 0, g_ms); run_ms(100);
	(void)HeadCore_Step(0, 1);
	long t3 = run_ms_until_state_not(HEAD_STATE_MOVING, 3000);
	float bound3 = jog_sps * (0.1f + HEAD_JOG_TIMEOUT_MS / 1000.0f) + decel0 + 5.0f;
	CHECK(t3 > 0 && (float)(HeadCore_GetPositionSteps(0) - p_before) <= bound3 &&
	      HeadCore_GetPositionSteps(0) < lim0,
	      "tap on TILT while holding PAN: PAN keeps its deadman (stops, not runs to the limit)");

	/* Dang giu PAN thi nhan chinh PAN 1 buoc: dung JOG, cong 1 buoc tu cho dung. */
	(void)HeadCore_Command(0, 0); (void)run_ms_until_state_not(HEAD_STATE_MOVING, 20000);
	p_before = HeadCore_GetPositionSteps(0);
	(void)HeadCore_Jog(1, 0, g_ms); run_ms(300);
	int32_t at_tap = HeadCore_GetPositionSteps(0);
	(void)HeadCore_Step(1, 0);
	long t4 = run_ms_until_state_not(HEAD_STATE_MOVING, 3000);
	int32_t after_tap = HeadCore_GetPositionSteps(0) - at_tap;
	CHECK(t4 > 0 && t4 < 1000 && (float)after_tap <= decel0 + (float)micro0 + 5.0f && HeadCore_GetPositionSteps(0) < lim0,
	      "tap on the jogging axis ends the jog instead of adding to the limit");
	(void)p_before;

	for (int i = 0; i < 200; i++) { (void)HeadCore_Jog(-1, 0, g_ms); run_ms(100); }   /* giu 20 s */
	CHECK(HeadCore_GetPositionSteps(0) == -cdeg_steps(0, HEAD_PAN_LIMIT_CDEG), "held long: stops exactly at the soft limit");
	CHECK(g_log[0].bad_pulse == 0 && g_log[1].bad_pulse == 0, "pulse timing holds");
}

int main(void)
{
	test_boot_is_disabled();
	printf("[config] pan %.4f steps/deg, max %.0f steps/s, accel %.0f steps/s^2\n",
	       (double)steps_per_deg(0), (double)max_sps(0), (double)accel_sps2(0));
	test_zero_enables_and_move_exact();
	test_speed_and_accel_limits();
	test_limits_rejected();
	test_reverse_mid_move();
	test_halt_decelerates();
	test_off_drops_reference();
	test_both_axes_together();
	test_sub_step_command();
	test_homing_against_hard_stop();
	test_homing_repeatable_rotor_model();
	test_homing_abort();
	test_step_taps();
	test_jog_hold_and_deadman();
	if (g_fail == 0) { printf("\nTAT CA TEST PASS\n"); return 0; }
	printf("\n%d TEST FAIL\n", g_fail);
	return 1;
}
