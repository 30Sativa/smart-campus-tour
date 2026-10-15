/* CPU BUDGET: TIM2 ticks this file's ISR at MOTOR_BASE_TIMER_HZ (50 kHz) on
 * a 16 MHz core, i.e. ~320 cycles per tick for EVERYTHING.  Built at the
 * Debug configuration's -O0, the old tick cost 156-275 cycles (49-86 % CPU,
 * measured by emulating the linked ISR) and starved the main loop: USB RX
 * queue overflow (ERR,bad_command), FB dropping from 40 Hz to 2-4 Hz while
 * driving.  Compile this file optimized whatever the project level is; the
 * ISR/main-loop shared state is volatile and changed under __disable_irq,
 * so optimization does not change its semantics. */
#pragma GCC optimize ("O2")

#include "motor/motor_core.h"
#include <stddef.h>

extern TIM_HandleTypeDef htim2;

/* Trang thai mot motor - PRIVATE, khong phoi ra header.
 * Cac field volatile la vung chia se voi ISR. */
typedef struct
{
	MotorHalPins pins;
	volatile uint8_t running;
	volatile uint8_t pulse_ticks_remaining;
	volatile int8_t direction;
	volatile uint32_t phase_accumulator;
	volatile uint32_t phase_increment;
	volatile int32_t count;
	float target_freq_hz;
} MotorCoreState;

static MotorCoreState motors[MOTOR_CORE_COUNT];

/* Base-timer ticks left before the ISR stops stepping (see FeedWatchdog).
 * One aligned 32-bit word: the main-loop store and the ISR read-decrement
 * cannot interleave on this single-core MCU. */
static volatile uint32_t watchdog_ticks_left = 0U;

static MotorCoreState *MotorCore_Get(uint8_t index)
{
	if (index >= MOTOR_CORE_COUNT)
	{
		return NULL;
	}
	return &motors[index];
}

static float MotorCore_ClampFrequency(float freq_hz)
{
	float max_safe_hz =
		(float)MotorHal_GetBaseTimerHz() / (float)((MOTOR_STEP_PULSE_TICKS + 1U) * 2U);

	if (max_safe_hz > MOTOR_MAX_STEP_FREQ_HZ)
	{
		max_safe_hz = MOTOR_MAX_STEP_FREQ_HZ;
	}

	if (freq_hz < MOTOR_MIN_STEP_FREQ_HZ)
	{
		return MOTOR_MIN_STEP_FREQ_HZ;
	}

	if (freq_hz > max_safe_hz)
	{
		return max_safe_hz;
	}

	return freq_hz;
}

static uint32_t MotorCore_FrequencyToPhaseIncrement(float freq_hz)
{
	double scale = 4294967296.0 / (double)MotorHal_GetBaseTimerHz();
	double increment = (double)freq_hz * scale;

	if (increment <= 0.0)
	{
		return 0U;
	}

	if (increment >= 4294967295.0)
	{
		return 0xFFFFFFFFU;
	}

	return (uint32_t)(increment + 0.5);
}

static inline __attribute__((always_inline)) void MotorCore_Tick(MotorCoreState *motor)
{
	uint32_t previous_phase;

	if (motor->pulse_ticks_remaining > 0U)
	{
		motor->pulse_ticks_remaining--;
		if (motor->pulse_ticks_remaining == 0U)
		{
			MOTOR_HAL_STEP_LOW(&motor->pins);
		}
	}

	if ((motor->running == 0U) || (motor->phase_increment == 0U))
	{
		return;
	}

	previous_phase = motor->phase_accumulator;
	motor->phase_accumulator += motor->phase_increment;

	if (motor->phase_accumulator < previous_phase)
	{
		MOTOR_HAL_STEP_HIGH(&motor->pins);
		motor->pulse_ticks_remaining = MOTOR_STEP_PULSE_TICKS;
		motor->count += motor->direction;
	}
}

void MotorCore_Init(const MotorHalPins *left, const MotorHalPins *right)
{
	motors[0].pins = *left;
	motors[1].pins = *right;

	for (uint8_t i = 0U; i < MOTOR_CORE_COUNT; i++)
	{
		motors[i].running = 0U;
		motors[i].pulse_ticks_remaining = 0U;
		motors[i].direction = 1;
		motors[i].phase_accumulator = 0U;
		motors[i].phase_increment = 0U;
		motors[i].count = 0;
		motors[i].target_freq_hz = 0.0f;
	}
}

void MotorCore_SetStepFrequencyHz(uint8_t index, float freq_hz, int8_t direction)
{
	MotorCoreState *motor = MotorCore_Get(index);
	float clamped_hz;
	uint32_t phase_increment;
	uint8_t reset_phase;

	if ((motor == NULL) || (direction == 0) || (freq_hz <= 0.0f))
	{
		MotorCore_Stop(index);
		return;
	}

	clamped_hz = MotorCore_ClampFrequency(freq_hz);
	phase_increment = MotorCore_FrequencyToPhaseIncrement(clamped_hz);

	__disable_irq();
	reset_phase = (uint8_t)((motor->running == 0U) || (motor->direction != direction));
	if (reset_phase != 0U)
	{
		motor->running = 0U;
		motor->pulse_ticks_remaining = 0U;
		motor->phase_accumulator = 0U;
		motor->phase_increment = 0U;
	}
	__enable_irq();

	if (reset_phase != 0U)
	{
		MotorHal_WriteStepLow(&motor->pins);
		MotorHal_WriteDir(&motor->pins, direction);
	}

	__disable_irq();
	motor->direction = direction;
	if (reset_phase != 0U)
	{
		motor->phase_accumulator = 0U;
		motor->pulse_ticks_remaining = 0U;
	}
	motor->phase_increment = phase_increment;
	motor->target_freq_hz = clamped_hz;
	motor->running = (phase_increment != 0U) ? 1U : 0U;
	__enable_irq();

	if (phase_increment == 0U)
	{
		MotorHal_WriteStepLow(&motor->pins);
	}
}

void MotorCore_Stop(uint8_t index)
{
	MotorCoreState *motor = MotorCore_Get(index);
	if (motor == NULL)
	{
		return;
	}

	__disable_irq();
	motor->running = 0U;
	motor->pulse_ticks_remaining = 0U;
	motor->phase_accumulator = 0U;
	motor->phase_increment = 0U;
	motor->target_freq_hz = 0.0f;
	__enable_irq();

	MotorHal_WriteStepLow(&motor->pins);
}

int32_t MotorCore_GetCount(uint8_t index)
{
	MotorCoreState *motor = MotorCore_Get(index);
	int32_t count;

	if (motor == NULL)
	{
		return 0;
	}

	__disable_irq();
	count = motor->count;
	__enable_irq();

	return count;
}

uint8_t MotorCore_IsRunning(uint8_t index)
{
	MotorCoreState *motor = MotorCore_Get(index);
	if (motor == NULL)
	{
		return 0U;
	}
	return motor->running;
}

float MotorCore_GetStepFrequencyHz(uint8_t index)
{
	MotorCoreState *motor = MotorCore_Get(index);
	if (motor == NULL)
	{
		return 0.0f;
	}
	return motor->target_freq_hz;
}

void MotorCore_SetDirIfIdle(uint8_t index, int8_t direction)
{
	MotorCoreState *motor = MotorCore_Get(index);
	if (motor == NULL)
	{
		return;
	}
	MotorHal_WriteDir(&motor->pins, direction);
}

void MotorCore_FeedWatchdog(uint32_t timeout_ms)
{
	uint64_t ticks = ((uint64_t)timeout_ms * MotorHal_GetBaseTimerHz()) / 1000U;

	if (ticks == 0U)
	{
		ticks = 1U;
	}
	else if (ticks > 0xFFFFFFFFU)
	{
		ticks = 0xFFFFFFFFU;
	}
	watchdog_ticks_left = (uint32_t)ticks;
}

void MotorCore_HandleTimerInterrupt(void)
{
	if (((htim2.Instance->SR & TIM_FLAG_UPDATE) != 0U) &&
		((htim2.Instance->DIER & TIM_IT_UPDATE) != 0U))
	{
		/* SR flags are rc_w0: write the mask (as __HAL_TIM_CLEAR_FLAG does)
		 * instead of read-modify-write, which can also clear a flag raised
		 * between the read and the write. */
		htim2.Instance->SR = (uint32_t)~TIM_FLAG_UPDATE;

		uint32_t left = watchdog_ticks_left;
		if (left != 0U)
		{
			watchdog_ticks_left = left - 1U;
		}
		else
		{
			/* Main loop has not fed us: stop stepping here. A pulse already
			 * high still ends next tick (Tick lowers it before the running
			 * check); the next CMD restarts via MotorCore_SetStepFrequencyHz. */
			motors[0].running = 0U;
			motors[1].running = 0U;
		}

		MotorCore_Tick(&motors[0]);
		MotorCore_Tick(&motors[1]);
	}
}
/* end of file */
