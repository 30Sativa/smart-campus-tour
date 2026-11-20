#include "motor/motor_encoder_core.h"

#include "main.h"

/* Chay trong SysTick (1 kHz, uu tien thap nhat): giu ngan ke ca o build -O0. */
#pragma GCC optimize("O2")

typedef struct
{
	uint16_t last_raw;
	uint8_t have_raw;         /* da co moc CNT sau Init */
	uint16_t window_ticks;
	int32_t window_start;
	volatile int32_t count;
	volatile int32_t speed_cps;
	volatile uint32_t transition_errors;
	volatile uint8_t level_a;
	volatile uint8_t level_b;
} MotorEncoderChannel;

static MotorEncoderChannel channels[MOTOR_ENCODER_CHANNELS];
static uint8_t encoder_enabled = 0U;
static volatile uint8_t encoder_state = MOTOR_ENCODER_DISABLED;
/* Tang moi lan Sample() ghi. Chi SysTick ghi, vong lap chinh khong ngat duoc
 * SysTick, nen GetStatus() chi doc lai khi so nay doi (giong motor_alarm_core):
 * khong tat ngat, khong lam tre ngat STEP TIM2. */
static volatile uint32_t encoder_generation = 0U;

/* motor_encoder.c chi cho SysTick lay mau SAU khi Init xong. */
void MotorEncoderCore_Init(uint8_t enabled)
{
	encoder_enabled = (enabled != 0U) ? 1U : 0U;
	encoder_state = (encoder_enabled != 0U) ? MOTOR_ENCODER_RX_OFF : MOTOR_ENCODER_DISABLED;
	for (uint8_t i = 0U; i < MOTOR_ENCODER_CHANNELS; i++)
	{
		MotorEncoderChannel *c = &channels[i];
		c->last_raw = 0U;
		c->have_raw = 0U;
		c->window_ticks = 0U;
		c->window_start = 0;
		c->count = 0;
		c->speed_cps = 0;
		c->transition_errors = 0U;
		c->level_a = 0U;
		c->level_b = 0U;
	}
	encoder_generation++;
}

void MotorEncoderCore_SetReceiver(uint8_t on)
{
	if (encoder_enabled == 0U)
	{
		return;
	}
	encoder_state = (on != 0U) ? MOTOR_ENCODER_RX_ON : MOTOR_ENCODER_RX_OFF;
}

uint8_t MotorEncoderCore_GetState(void)
{
	return encoder_state;
}

void MotorEncoderCore_Sample(uint8_t channel, uint16_t raw, uint8_t transition_error,
                             uint8_t level_a, uint8_t level_b)
{
	MotorEncoderChannel *c;
	int32_t count;

	if ((encoder_enabled == 0U) || (channel >= MOTOR_ENCODER_CHANNELS))
	{
		return;
	}
	c = &channels[channel];
	encoder_generation++;

	c->level_a = (level_a != 0U) ? 1U : 0U;
	c->level_b = (level_b != 0U) ? 1U : 0U;
	if (transition_error != 0U)
	{
		c->transition_errors++;
	}

	if (c->have_raw == 0U)
	{
		c->last_raw = raw;
		c->have_raw = 1U;
		c->window_start = c->count;
		c->window_ticks = 0U;
		return;
	}

	/* Hieu 16-bit co dau: dung khi CNT doi it hon 32768 giua hai mau (1 ms).
	 * Cong khong dau de bo dem 32-bit tu tran (int32 tran co dau la UB). */
	count = (int32_t)((uint32_t)c->count +
	                  (uint32_t)(int32_t)(int16_t)(uint16_t)(raw - c->last_raw));
	c->last_raw = raw;
	c->count = count;

	c->window_ticks++;
	if (c->window_ticks >= MOTOR_ENCODER_SPEED_WINDOW_MS)
	{
		int32_t moved = (int32_t)((uint32_t)count - (uint32_t)c->window_start);
		c->speed_cps = (int32_t)(((int64_t)moved * 1000) / (int32_t)MOTOR_ENCODER_SPEED_WINDOW_MS);
		c->window_start = count;
		c->window_ticks = 0U;
	}
}

void MotorEncoderCore_GetStatus(uint8_t channel, MotorEncoderStatus *out)
{
	const MotorEncoderChannel *c;

	if (out == 0)
	{
		return;
	}
	if (channel >= MOTOR_ENCODER_CHANNELS)
	{
		out->count = 0;
		out->speed_cps = 0;
		out->transition_errors = 0U;
		out->level_a = 0U;
		out->level_b = 0U;
		return;
	}
	c = &channels[channel];

	/* SysTick 1 kHz, ban sao < 1 us: lan doc thu hai gan nhu luon khop. */
	for (uint8_t attempt = 0U; attempt < 4U; attempt++)
	{
		uint32_t generation = encoder_generation;
		out->count = c->count;
		out->speed_cps = c->speed_cps;
		out->transition_errors = c->transition_errors;
		out->level_a = c->level_a;
		out->level_b = c->level_b;
		if (generation == encoder_generation)
		{
			break;
		}
	}
}

const char *MotorEncoderCore_StateText(uint8_t state)
{
	switch (state)
	{
	case MOTOR_ENCODER_DISABLED: return "DISABLED";
	case MOTOR_ENCODER_RX_OFF:   return "OFF";
	case MOTOR_ENCODER_RX_ON:    return "ON";
	default:                     return "?";
	}
}
