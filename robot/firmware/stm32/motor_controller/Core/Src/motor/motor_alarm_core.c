#include "motor/motor_alarm_core.h"

#include "main.h"

/* Chay trong SysTick (1 kHz, uu tien thap nhat): giu ngan ke ca o build -O0. */
#pragma GCC optimize("O2")

typedef struct
{
	volatile uint8_t state;
	uint8_t candidate;
	uint16_t candidate_count;
	uint8_t pending;          /* dang co mau lech chua du loc */
	volatile uint8_t raw_pu;
	volatile uint8_t raw_pd;
	uint8_t have_pu;
	uint8_t have_pd;
	volatile uint32_t trips;
	volatile uint32_t glitches;
	volatile uint32_t last_change_ms;
	volatile uint32_t last_trip_ms;
} MotorAlarmChannel;

static MotorAlarmChannel channels[MOTOR_ALARM_CHANNELS];
static uint8_t alarm_enabled = 0U;
/* Tang moi lan Sample() ghi. Chi SysTick ghi, va vong lap chinh khong bao
 * gio ngat duoc SysTick, nen GetStatus() chi can doc lai neu so nay doi -
 * khong phai tat ngat (tat ngat se lam tre ngat STEP TIM2). */
static volatile uint32_t alarm_generation = 0U;

/* motor_alarm.c chi bat SysTick lay mau SAU khi Init xong, nen khong can
 * tat ngat o day. */
void MotorAlarmCore_Init(uint8_t enabled)
{
	alarm_enabled = (enabled != 0U) ? 1U : 0U;
	for (uint8_t i = 0U; i < MOTOR_ALARM_CHANNELS; i++)
	{
		MotorAlarmChannel *c = &channels[i];
		c->state = (alarm_enabled != 0U) ? MOTOR_ALARM_UNKNOWN : MOTOR_ALARM_DISABLED;
		c->candidate = MOTOR_ALARM_UNKNOWN;
		c->candidate_count = 0U;
		c->pending = 0U;
		c->raw_pu = 0U;
		c->raw_pd = 0U;
		c->have_pu = 0U;
		c->have_pd = 0U;
		c->trips = 0U;
		c->glitches = 0U;
		c->last_change_ms = 0U;
		c->last_trip_ms = 0U;
	}
	alarm_generation++;
}

static uint8_t MotorAlarmCore_Classify(const MotorAlarmChannel *c)
{
	if (c->raw_pu != c->raw_pd)
	{
		return MOTOR_ALARM_NO_SIGNAL;
	}
	return (c->raw_pu == MOTOR_ALARM_ACTIVE_LEVEL) ? MOTOR_ALARM_ALARM : MOTOR_ALARM_OK;
}

void MotorAlarmCore_Sample(uint8_t channel, uint8_t level, uint8_t pulled_up,
                           uint8_t probe, uint32_t now_ms)
{
	MotorAlarmChannel *c;
	uint8_t sample;

	if ((alarm_enabled == 0U) || (channel >= MOTOR_ALARM_CHANNELS))
	{
		return;
	}
	c = &channels[channel];
	level = (level != 0U) ? 1U : 0U;
	alarm_generation++;

	if ((probe == 0U) || (pulled_up != 0U))
	{
		c->raw_pu = level;
		c->have_pu = 1U;
	}
	if ((probe == 0U) || (pulled_up == 0U))
	{
		c->raw_pd = level;
		c->have_pd = 1U;
	}
	if ((c->have_pu == 0U) || (c->have_pd == 0U))
	{
		return;   /* chua du mot cap PU/PD sau khi khoi dong */
	}

	sample = MotorAlarmCore_Classify(c);
	if (sample == c->state)
	{
		if (c->pending != 0U)
		{
			c->glitches++;   /* lech roi quay lai truoc khi du loc: nhieu */
			c->pending = 0U;
		}
		c->candidate_count = 0U;
		return;
	}

	if (sample != c->candidate)
	{
		c->candidate = sample;
		c->candidate_count = 0U;
	}
	if (c->state != MOTOR_ALARM_UNKNOWN)
	{
		c->pending = 1U;
	}
	if (c->candidate_count < 0xFFFFU)
	{
		c->candidate_count++;
	}
	if (c->candidate_count < MOTOR_ALARM_DEBOUNCE_MS)
	{
		return;
	}

	c->state = sample;
	c->pending = 0U;
	c->candidate_count = 0U;
	c->last_change_ms = now_ms;
	if (sample == MOTOR_ALARM_ALARM)
	{
		c->trips++;
		c->last_trip_ms = now_ms;
	}
}

void MotorAlarmCore_GetStatus(uint8_t channel, MotorAlarmStatus *out)
{
	const MotorAlarmChannel *c;

	if (out == 0)
	{
		return;
	}
	if (channel >= MOTOR_ALARM_CHANNELS)
	{
		out->state = MOTOR_ALARM_DISABLED;
		out->raw_pu = 0U;
		out->raw_pd = 0U;
		out->trips = 0U;
		out->glitches = 0U;
		out->last_change_ms = 0U;
		out->last_trip_ms = 0U;
		return;
	}
	c = &channels[channel];

	/* SysTick 1 kHz, ban sao < 1 us: lan doc thu hai gan nhu luon khop. */
	for (uint8_t attempt = 0U; attempt < 4U; attempt++)
	{
		uint32_t generation = alarm_generation;
		out->state = c->state;
		out->raw_pu = c->raw_pu;
		out->raw_pd = c->raw_pd;
		out->trips = c->trips;
		out->glitches = c->glitches;
		out->last_change_ms = c->last_change_ms;
		out->last_trip_ms = c->last_trip_ms;
		if (generation == alarm_generation)
		{
			break;
		}
	}
}

uint8_t MotorAlarmCore_IsEnabled(void)
{
	return alarm_enabled;
}

const char *MotorAlarmCore_StateText(uint8_t state)
{
	switch (state)
	{
	case MOTOR_ALARM_DISABLED:  return "DISABLED";
	case MOTOR_ALARM_UNKNOWN:   return "UNKNOWN";
	case MOTOR_ALARM_OK:        return "OK";
	case MOTOR_ALARM_ALARM:     return "ALARM";
	case MOTOR_ALARM_NO_SIGNAL: return "NO_SIGNAL";
	default:                    return "?";
	}
}
