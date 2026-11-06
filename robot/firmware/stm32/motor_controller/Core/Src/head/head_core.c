/* Bo phat xung + profile hinh thang cho dau quay PAN/TILT (xem head_core.h).
 *
 * CPU: TIM6 goi HeadCore_HandleTick o 10 kHz, uu tien thap hon TIM2 (banh xe).
 * Build -O2 bat ke cau hinh Debug, cung ly do voi motor_core.c
 * (docs/MOTOR_ISR_BUDGET.md). Trang thai chia se voi ISR la volatile va chi
 * doi tu main loop trong __disable_irq. */
#pragma GCC optimize ("O2")

#include "head/head_core.h"

#include <math.h>
#include <stddef.h>

typedef struct
{
	HeadAxisPins pins;
	volatile int32_t pos;            /* so buoc da phat, co dau */
	volatile uint32_t elec;          /* tong xung co dau tu luc Init, KHONG bao gio dat lai:
	                                  * elec % HEAD_PHASE_PERIOD = pha bo dem buoc cua DRV8825 */
	volatile int32_t target;
	volatile float vel;              /* buoc/s, co dau; chi ISR ghi tru Off/Halt */
	volatile uint32_t phase_acc;
	volatile uint32_t phase_inc;
	volatile uint8_t pulse_ticks;
	volatile uint8_t dir_settle;     /* tick cho sau khi doi DIR truoc buoc ke */
	volatile uint8_t step_pending;   /* pha tran dung tick chua duoc phep phat xung */
	volatile int8_t dir;             /* +1 / -1, khop muc chan DIR dang xuat */
	volatile float speed_cap;        /* toc do toi da cua chuyen dong hien tai (buoc/s) */
	float max_sps;                   /* lenh goc tuyet doi */
	float jog_sps;                   /* STEP / JOG */
	float home_sps;                  /* tim vat can */
	float accel_sps2;
	float steps_per_cdeg;
	int32_t limit_cdeg;
	int32_t limit_steps;
	int32_t home_seek_steps;         /* co dau: chieu toi vat can */
	int32_t home_stop_steps;         /* vi tri vat can tinh tu 0, co dau */
	uint32_t home_settle_start_ms;
	uint8_t home_phase;              /* HOME_PHASE_* (chi main loop) */
} HeadAxis;

static HeadAxis axes[HEAD_AXIS_COUNT];
static volatile uint8_t s_enabled = 0U;
static volatile uint8_t s_zeroed = 0U;
static uint8_t s_homing = 0U;            /* chi main loop */
static uint8_t s_jog_axes = 0U;          /* bit i = truc i dang JOG (chi main loop) */
static uint32_t s_jog_last_ms = 0U;
static uint8_t s_profile_div = 0U;

/* Chu ky pha dien cua DRV8825: 4 buoc du = 4 * HEAD_MICROSTEP xung. */
#define HEAD_PHASE_PERIOD ((uint32_t)(4.0f * HEAD_MICROSTEP + 0.5f))

#define HOME_PHASE_NONE   0U     /* xong / khong homing */
#define HOME_PHASE_SEEK   1U     /* quay toi vat can */
#define HOME_PHASE_SETTLE 2U     /* dung yen cho roto on dinh */
#define HOME_PHASE_RETURN 3U     /* tu vat can ve 0 */

#define PIN_HIGH(port, pin) ((port)->BSRR = (uint32_t)(pin))
#define PIN_LOW(port, pin)  ((port)->BSRR = ((uint32_t)(pin) << 16U))

static void HeadCore_WriteDir(const HeadAxisPins *p, int8_t dir)
{
	uint8_t level = (uint8_t)(((dir >= 0) ? 1U : 0U) ^ p->dir_invert);
	if (level != 0U) PIN_HIGH(p->dir_port, p->dir_pin);
	else             PIN_LOW(p->dir_port, p->dir_pin);
}

static void HeadCore_WriteEnable(uint8_t on)
{
	for (uint8_t i = 0U; i < HEAD_AXIS_COUNT; i++)
	{
		/* nEN tich cuc muc thap. */
		if (on != 0U) PIN_LOW(axes[i].pins.en_port, axes[i].pins.en_pin);
		else          PIN_HIGH(axes[i].pins.en_port, axes[i].pins.en_pin);
	}
}

static float HeadCore_ClampSps(float sps)
{
	if (sps > HEAD_MAX_STEP_HZ) sps = HEAD_MAX_STEP_HZ;
	if (sps > ((float)HEAD_TICK_HZ * 0.5f)) sps = (float)HEAD_TICK_HZ * 0.5f;
	return sps;
}

static void HeadCore_InitAxis(HeadAxis *a, const HeadAxisPins *pins,
                              float gear_ratio, int32_t limit_cdeg,
                              int32_t home_dir, int32_t home_offset_cdeg,
                              int32_t home_seek_cdeg)
{
	float steps_per_deg = (HEAD_MOTOR_STEPS_PER_REV * HEAD_MICROSTEP * gear_ratio) / 360.0f;
	float max_sps = HeadCore_ClampSps(HEAD_MAX_SPEED_DPS * steps_per_deg);
	int32_t sign = (home_dir < 0) ? -1 : 1;

	a->pins = *pins;
	a->pos = 0;
	a->elec = 0U;    /* DRV8825 vua cap nguon cung STM32: bo dem buoc o trang thai home */
	a->target = 0;
	a->vel = 0.0f;
	a->phase_acc = 0U;
	a->phase_inc = 0U;
	a->pulse_ticks = 0U;
	a->dir_settle = 0U;
	a->step_pending = 0U;
	a->dir = 1;
	a->max_sps = max_sps;
	a->jog_sps = HeadCore_ClampSps(HEAD_JOG_SPEED_DPS * steps_per_deg);
	a->home_sps = HeadCore_ClampSps(HEAD_HOME_SPEED_DPS * steps_per_deg);
	a->speed_cap = max_sps;
	a->accel_sps2 = HEAD_ACCEL_DPS2 * steps_per_deg;
	a->steps_per_cdeg = steps_per_deg / 100.0f;
	a->limit_cdeg = limit_cdeg;
	a->limit_steps = (int32_t)lroundf((float)limit_cdeg * a->steps_per_cdeg);
	a->home_seek_steps = sign * (int32_t)lroundf((float)home_seek_cdeg * a->steps_per_cdeg);
	a->home_stop_steps = sign * (int32_t)lroundf((float)home_offset_cdeg * a->steps_per_cdeg);
	a->home_settle_start_ms = 0U;
	a->home_phase = HOME_PHASE_NONE;

	PIN_LOW(a->pins.step_port, a->pins.step_pin);
	HeadCore_WriteDir(&a->pins, 1);
}

void HeadCore_Init(const HeadAxisPins *pan, const HeadAxisPins *tilt)
{
	HeadCore_InitAxis(&axes[HEAD_AXIS_PAN], pan, HEAD_PAN_GEAR_RATIO, HEAD_PAN_LIMIT_CDEG,
	                  HEAD_PAN_HOME_DIR, HEAD_PAN_HOME_OFFSET_CDEG, HEAD_PAN_HOME_SEEK_CDEG);
	HeadCore_InitAxis(&axes[HEAD_AXIS_TILT], tilt, HEAD_TILT_GEAR_RATIO, HEAD_TILT_LIMIT_CDEG,
	                  HEAD_TILT_HOME_DIR, HEAD_TILT_HOME_OFFSET_CDEG, HEAD_TILT_HOME_SEEK_CDEG);
	s_profile_div = 0U;
	s_homing = 0U;
	s_jog_axes = 0U;
	s_zeroed = 0U;
	s_enabled = 0U;
	HeadCore_WriteEnable(0U);
}

static int32_t HeadCore_CdegToSteps(const HeadAxis *a, int32_t cdeg)
{
	return (int32_t)lroundf((float)cdeg * a->steps_per_cdeg);
}

static int32_t HeadCore_StepsToCdeg(const HeadAxis *a, int32_t steps)
{
	return (int32_t)lroundf((float)steps / a->steps_per_cdeg);
}

static int32_t HeadCore_Abs32(int32_t v)
{
	return (v < 0) ? -v : v;
}

HeadResult HeadCore_Command(int32_t pan_cdeg, int32_t tilt_cdeg)
{
	int32_t pan_steps;
	int32_t tilt_steps;

	if (s_homing != 0U)
	{
		return HEAD_ERR_BUSY;
	}
	if (s_zeroed == 0U)
	{
		return HEAD_ERR_NOT_ZEROED;
	}
	if ((HeadCore_Abs32(pan_cdeg) > axes[HEAD_AXIS_PAN].limit_cdeg) ||
	    (HeadCore_Abs32(tilt_cdeg) > axes[HEAD_AXIS_TILT].limit_cdeg))
	{
		return HEAD_ERR_LIMIT;
	}

	pan_steps = HeadCore_CdegToSteps(&axes[HEAD_AXIS_PAN], pan_cdeg);
	tilt_steps = HeadCore_CdegToSteps(&axes[HEAD_AXIS_TILT], tilt_cdeg);

	s_jog_axes = 0U;
	__disable_irq();
	axes[HEAD_AXIS_PAN].speed_cap = axes[HEAD_AXIS_PAN].max_sps;
	axes[HEAD_AXIS_TILT].speed_cap = axes[HEAD_AXIS_TILT].max_sps;
	axes[HEAD_AXIS_PAN].target = pan_steps;
	axes[HEAD_AXIS_TILT].target = tilt_steps;
	__enable_irq();
	return HEAD_OK;
}

static int32_t HeadCore_ClampToLimit(const HeadAxis *a, int64_t steps)
{
	if (steps > (int64_t)a->limit_steps)  return a->limit_steps;
	if (steps < -(int64_t)a->limit_steps) return -a->limit_steps;
	return (int32_t)steps;
}

/* Giam toc truc a ve 0 (goi trong critical section). */
static void HeadCore_HaltAxisLocked(HeadAxis *a)
{
	float v = a->vel;
	float speed = fabsf(v);
	int32_t stop_steps = 0;

	if (speed > 0.0f)
	{
		stop_steps = (int32_t)ceilf((speed * speed) / (2.0f * a->accel_sps2));
	}
	a->target = a->pos + ((v < 0.0f) ? -stop_steps : stop_steps);
}

HeadResult HeadCore_Step(int32_t pan_full_steps, int32_t tilt_full_steps)
{
	const int32_t micro = (int32_t)HEAD_MICROSTEP;
	int32_t delta[HEAD_AXIS_COUNT];

	if (s_homing != 0U)
	{
		return HEAD_ERR_BUSY;
	}
	if (s_zeroed == 0U)
	{
		return HEAD_ERR_NOT_ZEROED;
	}

	delta[HEAD_AXIS_PAN] = pan_full_steps;
	delta[HEAD_AXIS_TILT] = tilt_full_steps;

	__disable_irq();
	for (uint8_t i = 0U; i < HEAD_AXIS_COUNT; i++)
	{
		HeadAxis *a = &axes[i];
		uint8_t bit = (uint8_t)(1U << i);
		if (delta[i] == 0)
		{
			/* Truc khong duoc nhan: neu dang JOG thi giu nguyen JOG va deadman
			 * cua no (khong duoc xoa bit, neu khong truc do chay toi gioi han). */
			continue;
		}
		if ((s_jog_axes & bit) != 0U)
		{
			/* Truc dang JOG (dich = gioi han): dung lai truoc roi moi cong buoc,
			 * neu khong buoc nhan se cong vao gioi han va truc chay tiep. */
			HeadCore_HaltAxisLocked(a);
			s_jog_axes &= (uint8_t)~bit;
		}
		a->speed_cap = a->jog_sps;
		/* Cong don vao DICH (khong phai vi tri): nhan nhanh 5 lan = 5 buoc. */
		a->target = HeadCore_ClampToLimit(a, (int64_t)a->target + ((int64_t)delta[i] * micro));
	}
	__enable_irq();
	return HEAD_OK;
}

HeadResult HeadCore_Jog(int8_t pan_dir, int8_t tilt_dir, uint32_t now_ms)
{
	int8_t dir[HEAD_AXIS_COUNT];

	if (s_homing != 0U)
	{
		return HEAD_ERR_BUSY;
	}
	if (s_zeroed == 0U)
	{
		return HEAD_ERR_NOT_ZEROED;
	}

	dir[HEAD_AXIS_PAN] = pan_dir;
	dir[HEAD_AXIS_TILT] = tilt_dir;

	__disable_irq();
	for (uint8_t i = 0U; i < HEAD_AXIS_COUNT; i++)
	{
		HeadAxis *a = &axes[i];
		uint8_t bit = (uint8_t)(1U << i);
		if (dir[i] != 0)
		{
			a->speed_cap = a->jog_sps;
			a->target = (dir[i] > 0) ? a->limit_steps : -a->limit_steps;
			s_jog_axes |= bit;
		}
		else if ((s_jog_axes & bit) != 0U)
		{
			HeadCore_HaltAxisLocked(a);
			s_jog_axes &= (uint8_t)~bit;
		}
	}
	__enable_irq();
	s_jog_last_ms = now_ms;
	return HEAD_OK;
}

uint8_t HeadCore_IsMoving(uint8_t axis)
{
	if (axis >= HEAD_AXIS_COUNT) return 0U;
	return (uint8_t)((axes[axis].vel != 0.0f) || (axes[axis].pos != axes[axis].target));
}

HeadResult HeadCore_Zero(void)
{
	if (s_homing != 0U)
	{
		return HEAD_ERR_BUSY;
	}
	if ((s_enabled != 0U) &&
	    ((HeadCore_IsMoving(HEAD_AXIS_PAN) != 0U) || (HeadCore_IsMoving(HEAD_AXIS_TILT) != 0U)))
	{
		return HEAD_ERR_BUSY;
	}

	__disable_irq();
	for (uint8_t i = 0U; i < HEAD_AXIS_COUNT; i++)
	{
		axes[i].pos = 0;
		axes[i].target = 0;
		axes[i].vel = 0.0f;
		axes[i].phase_inc = 0U;
		axes[i].phase_acc = 0U;
		axes[i].step_pending = 0U;
		axes[i].speed_cap = axes[i].max_sps;
	}
	s_zeroed = 1U;
	s_enabled = 1U;
	s_jog_axes = 0U;
	__enable_irq();

	HeadCore_WriteEnable(1U);
	return HEAD_OK;
}

/* Quang seek (co dau) keo dai them 0..HEAD_PHASE_PERIOD-1 xung theo chieu
 * seek de xung cuoi roi vao pha elec % HEAD_PHASE_PERIOD == 0.
 *
 * Ly do: motor buoc ep vao vat can se truot, va khi dung han roto nam o vi
 * tri can bang cua pha dien cuoi cung gan vat can nhat (cach vat can < 2 buoc
 * du ve mot trong hai phia). Pha cuoi ngau nhien -> moc 0 lech ngau nhien
 * toi +/-2 buoc du (PAN 1.2 do, TILT 3.6 do). Pha cuoi co dinh -> vi tri can
 * bang do co dinh -> moc 0 lap lai, phan lech con lai la hang so va duoc
 * HOME_OFFSET hieu chinh. Goi trong critical section. */
static int32_t HeadCore_AlignedSeekLocked(const HeadAxis *a)
{
	int32_t seek = a->home_seek_steps;
#if HEAD_HOME_PHASE_ALIGN
	const uint32_t period = HEAD_PHASE_PERIOD;
	uint32_t r = (a->elec + (uint32_t)seek) % period;   /* period la luy thua 2: dung ca khi tran */
	if (r != 0U)
	{
		if (seek > 0) seek += (int32_t)(period - r);
		else          seek -= (int32_t)r;
	}
#endif
	return seek;
}

HeadResult HeadCore_Home(void)
{
	if ((s_homing != 0U) ||
	    ((s_enabled != 0U) &&
	     ((HeadCore_IsMoving(HEAD_AXIS_PAN) != 0U) || (HeadCore_IsMoving(HEAD_AXIS_TILT) != 0U))))
	{
		return HEAD_ERR_BUSY;
	}

	s_jog_axes = 0U;
	__disable_irq();
	for (uint8_t i = 0U; i < HEAD_AXIS_COUNT; i++)
	{
		HeadAxis *a = &axes[i];
		/* Vi tri dem hien tai khong co y nghia; chi can quay du quang seek. */
		a->pos = 0;
		a->vel = 0.0f;
		a->phase_inc = 0U;
		a->phase_acc = 0U;
		a->step_pending = 0U;
		a->speed_cap = a->home_sps;
		a->target = HeadCore_AlignedSeekLocked(a);
		a->home_phase = HOME_PHASE_SEEK;
	}
	s_zeroed = 0U;
	s_homing = 1U;
	s_enabled = 1U;
	__enable_irq();

	HeadCore_WriteEnable(1U);
	return HEAD_OK;
}

void HeadCore_Service(uint32_t now_ms)
{
	if ((s_jog_axes != 0U) && ((uint32_t)(now_ms - s_jog_last_ms) > HEAD_JOG_TIMEOUT_MS))
	{
		/* Deadman: host ngung gui JOG (nha nut nhung mat lenh, mat mang...). */
		__disable_irq();
		for (uint8_t i = 0U; i < HEAD_AXIS_COUNT; i++)
		{
			if ((s_jog_axes & (1U << i)) != 0U)
			{
				HeadCore_HaltAxisLocked(&axes[i]);
			}
		}
		__enable_irq();
		s_jog_axes = 0U;
	}

	if (s_homing == 0U)
	{
		return;
	}

	{
		uint8_t all_done = 1U;
		for (uint8_t i = 0U; i < HEAD_AXIS_COUNT; i++)
		{
			HeadAxis *a = &axes[i];
			if ((a->home_phase == HOME_PHASE_SEEK) && (HeadCore_IsMoving(i) == 0U))
			{
				/* Da quay het quang seek: truc dang ep vao vat can. Giu yen
				 * cho roto het rung truoc khi dat moc. */
				a->home_settle_start_ms = now_ms;
				a->home_phase = HOME_PHASE_SETTLE;
			}
			else if ((a->home_phase == HOME_PHASE_SETTLE) &&
			         ((uint32_t)(now_ms - a->home_settle_start_ms) >= HEAD_HOME_SETTLE_MS))
			{
				__disable_irq();
				a->pos = a->home_stop_steps;
				a->target = 0;
				a->speed_cap = a->max_sps;
				__enable_irq();
				a->home_phase = HOME_PHASE_RETURN;
			}
			else if ((a->home_phase == HOME_PHASE_RETURN) && (HeadCore_IsMoving(i) == 0U))
			{
				a->home_phase = HOME_PHASE_NONE;
			}
			if (a->home_phase != HOME_PHASE_NONE)
			{
				all_done = 0U;
			}
		}
		if (all_done != 0U)
		{
			s_homing = 0U;
			s_zeroed = 1U;
		}
	}
}

void HeadCore_Off(void)
{
	__disable_irq();
	s_enabled = 0U;
	s_zeroed = 0U;
	s_homing = 0U;
	s_jog_axes = 0U;
	for (uint8_t i = 0U; i < HEAD_AXIS_COUNT; i++)
	{
		axes[i].home_phase = HOME_PHASE_NONE;
		axes[i].vel = 0.0f;
		axes[i].phase_inc = 0U;
		axes[i].phase_acc = 0U;
		axes[i].step_pending = 0U;
		axes[i].pulse_ticks = 0U;
		axes[i].target = axes[i].pos;
		PIN_LOW(axes[i].pins.step_port, axes[i].pins.step_pin);
	}
	__enable_irq();

	HeadCore_WriteEnable(0U);
}

void HeadCore_Halt(void)
{
	__disable_irq();
	if (s_homing != 0U)
	{
		/* Huy homing giua chung: vi tri khong con dung -> mat moc. */
		s_homing = 0U;
		s_zeroed = 0U;
	}
	s_jog_axes = 0U;
	for (uint8_t i = 0U; i < HEAD_AXIS_COUNT; i++)
	{
		axes[i].home_phase = HOME_PHASE_NONE;
		HeadCore_HaltAxisLocked(&axes[i]);
	}
	__enable_irq();
}

void HeadCore_GetStatus(HeadStatus *status)
{
	int32_t pan_pos;
	int32_t tilt_pos;
	uint8_t moving;

	if (status == NULL) return;

	__disable_irq();
	pan_pos = axes[HEAD_AXIS_PAN].pos;
	tilt_pos = axes[HEAD_AXIS_TILT].pos;
	moving = (uint8_t)(HeadCore_IsMoving(HEAD_AXIS_PAN) | HeadCore_IsMoving(HEAD_AXIS_TILT));
	__enable_irq();

	status->zeroed = s_zeroed;
	status->pan_cdeg = HeadCore_StepsToCdeg(&axes[HEAD_AXIS_PAN], pan_pos);
	status->tilt_cdeg = HeadCore_StepsToCdeg(&axes[HEAD_AXIS_TILT], tilt_pos);
	if (s_enabled == 0U)      status->state = HEAD_STATE_OFF;
	else if (s_homing != 0U)  status->state = HEAD_STATE_HOMING;
	else if (moving != 0U)    status->state = HEAD_STATE_MOVING;
	else if (s_zeroed == 0U)  status->state = HEAD_STATE_NO_REF;
	else                      status->state = HEAD_STATE_IDLE;
}

int32_t HeadCore_GetPositionSteps(uint8_t axis)
{
	return (axis < HEAD_AXIS_COUNT) ? axes[axis].pos : 0;
}

int32_t HeadCore_GetTargetSteps(uint8_t axis)
{
	return (axis < HEAD_AXIS_COUNT) ? axes[axis].target : 0;
}

float HeadCore_StepsPerCdeg(uint8_t axis)
{
	return (axis < HEAD_AXIS_COUNT) ? axes[axis].steps_per_cdeg : 0.0f;
}

/* Profile 1 kHz. Doi chieu chi xay ra khi van toc di qua 0, nen chan DIR
 * khong bao gio doi giua luc dang phat xung theo chieu cu. */
static void HeadCore_UpdateProfile(HeadAxis *a)
{
	const float dt = (float)HEAD_PROFILE_DIV / (float)HEAD_TICK_HZ;
	int32_t d = a->target - a->pos;
	float v = a->vel;
	float speed;

	if (d == 0)
	{
		/* Toi dich: toc do luc nay <= sqrt(2a) (vai chuc buoc/s), dung luon
		 * thay vi giam toc them -- giam toc tiep se vuot dich roi dao chieu. */
		v = 0.0f;
	}
	else if ((v != 0.0f) && ((v > 0.0f) != (d > 0)))
	{
		/* Dang chay xa dich (doi dich nguoc chieu): giam toc ve 0 truoc. */
		speed = fabsf(v) - (a->accel_sps2 * dt);
		if (speed < 0.0f) speed = 0.0f;
		v = (v > 0.0f) ? speed : -speed;
	}
	else
	{
		float v_stop = sqrtf(2.0f * a->accel_sps2 * (float)((d > 0) ? d : -d));
		float cap = a->speed_cap;
		float now_speed = fabsf(v);
		if (now_speed > cap)
		{
			/* Gioi han vua bi ha (vd chuyen tu lenh goc sang JOG): giam toc
			 * theo gia toc, khong cat toc do dot ngot. */
			speed = now_speed - (a->accel_sps2 * dt);
			if (speed < cap) speed = cap;
		}
		else
		{
			speed = now_speed + (a->accel_sps2 * dt);
			if (speed > cap) speed = cap;
		}
		if (speed > v_stop) speed = v_stop;
		v = (d > 0) ? speed : -speed;
	}

	if (v != 0.0f)
	{
		int8_t nd = (v > 0.0f) ? 1 : -1;
		if (nd != a->dir)
		{
			a->dir = nd;
			HeadCore_WriteDir(&a->pins, nd);
			a->dir_settle = 1U;     /* >= 100 us truoc canh STEP ke (DRV8825 can 650 ns) */
			a->phase_acc = 0U;
			a->step_pending = 0U;
		}
	}

	a->vel = v;
	a->phase_inc = (uint32_t)(fabsf(v) * (4294967296.0f / (float)HEAD_TICK_HZ));
}

static inline __attribute__((always_inline)) void HeadCore_TickAxis(HeadAxis *a, uint8_t do_profile)
{
	uint8_t can_step = 1U;
	uint32_t previous;

	/* Duong nhanh: truc dung yen o dung dich (phase_inc = 0 <=> vel = 0).
	 * Bo qua ca profile: dich doi (Command/Halt) thi pos != target va
	 * duong day du chay lai o tick ke tiep. */
	if ((a->pulse_ticks == 0U) && (a->phase_inc == 0U) && (a->pos == a->target))
	{
		return;
	}

	if (a->pulse_ticks != 0U)
	{
		/* Xung dang cao tu tick truoc: ha xuong; tick nay khong duoc phat
		 * canh len moi (dam bao thap >= 1 tick). */
		a->pulse_ticks--;
		PIN_LOW(a->pins.step_port, a->pins.step_pin);
		can_step = 0U;
	}

	if (do_profile != 0U)
	{
		HeadCore_UpdateProfile(a);
	}

	if (a->dir_settle != 0U)
	{
		a->dir_settle--;
		return;
	}

	if (a->phase_inc == 0U)
	{
		a->step_pending = 0U;
		return;
	}

	/* Pha cong deu MOI tick, ke ca tick dang ha xung, de toc do thuc dung
	 * bang toc do dat. Tran ma chua duoc phat thi giu lai (step_pending) va
	 * phat o tick ke tiep. Tran HEAD_MAX_STEP_HZ < HEAD_TICK_HZ/2 nen toi da
	 * chi tre 1 tick, khong mat xung. */
	previous = a->phase_acc;
	a->phase_acc = previous + a->phase_inc;
	if (a->phase_acc < previous)
	{
		a->step_pending = 1U;
	}

	/* Khong bao gio phat xung khi da o dung dich. */
	if ((can_step == 0U) || (a->step_pending == 0U) || (a->pos == a->target))
	{
		return;
	}

	a->step_pending = 0U;
	PIN_HIGH(a->pins.step_port, a->pins.step_pin);
	a->pulse_ticks = 1U;
	a->pos += a->dir;
	a->elec += (uint32_t)(int32_t)a->dir;
}

void HeadCore_HandleTick(void)
{
	uint8_t do_profile = 0U;

	if (s_enabled == 0U)
	{
		return;
	}

	s_profile_div++;
	if (s_profile_div >= HEAD_PROFILE_DIV)
	{
		s_profile_div = 0U;
		do_profile = 1U;
	}

	HeadCore_TickAxis(&axes[HEAD_AXIS_PAN], do_profile);
	HeadCore_TickAxis(&axes[HEAD_AXIS_TILT], do_profile);
}
/* end of file */
