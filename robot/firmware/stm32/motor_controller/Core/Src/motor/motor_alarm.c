#include "motor/motor_alarm.h"

#include "main.h"

/* Chay trong SysTick: giu ngan ke ca o build -O0. */
#pragma GCC optimize("O2")

#define MOTOR_ALARM_PORT       GPIOC
#define MOTOR_ALARM_LEFT_PIN   10U
#define MOTOR_ALARM_RIGHT_PIN  11U

/* PUPDR: 2 bit/chan, 01 = pull-up, 10 = pull-down. */
#define MOTOR_ALARM_PUPDR_MASK ((3UL << (2U * MOTOR_ALARM_LEFT_PIN)) | (3UL << (2U * MOTOR_ALARM_RIGHT_PIN)))
#define MOTOR_ALARM_PUPDR_UP   ((1UL << (2U * MOTOR_ALARM_LEFT_PIN)) | (1UL << (2U * MOTOR_ALARM_RIGHT_PIN)))
#define MOTOR_ALARM_PUPDR_DOWN ((2UL << (2U * MOTOR_ALARM_LEFT_PIN)) | (2UL << (2U * MOTOR_ALARM_RIGHT_PIN)))

static volatile uint8_t alarm_hw_ready = 0U;
static uint8_t alarm_pulled_up = 1U;   /* pull dang bat cho lan doc ke tiep */

void MotorAlarm_Init(void)
{
#if MOTOR_ALARM_ENABLE
	GPIO_InitTypeDef GPIO_InitStruct = {0};

	alarm_hw_ready = 0U;
	MotorAlarmCore_Init(1U);

	__HAL_RCC_GPIOC_CLK_ENABLE();
	GPIO_InitStruct.Pin = (1U << MOTOR_ALARM_LEFT_PIN) | (1U << MOTOR_ALARM_RIGHT_PIN);
	GPIO_InitStruct.Mode = GPIO_MODE_INPUT;
	GPIO_InitStruct.Pull = GPIO_PULLUP;
	GPIO_InitStruct.Speed = GPIO_SPEED_FREQ_LOW;
	HAL_GPIO_Init(MOTOR_ALARM_PORT, &GPIO_InitStruct);

	alarm_pulled_up = 1U;
	alarm_hw_ready = 1U;
#else
	MotorAlarmCore_Init(0U);
#endif
}

void MotorAlarm_Tick(void)
{
	uint32_t idr;
	uint32_t now;
	uint8_t pulled_up;

	if (alarm_hw_ready == 0U)
	{
		return;
	}

	/* Pull hien tai da on dinh tu tick truoc (1 ms >> RC cua chan). */
	idr = MOTOR_ALARM_PORT->IDR;
	now = HAL_GetTick();
	pulled_up = alarm_pulled_up;
	MotorAlarmCore_Sample(0U, (uint8_t)((idr >> MOTOR_ALARM_LEFT_PIN) & 1U),
	                      pulled_up, MOTOR_ALARM_FLOAT_PROBE, now);
	MotorAlarmCore_Sample(1U, (uint8_t)((idr >> MOTOR_ALARM_RIGHT_PIN) & 1U),
	                      pulled_up, MOTOR_ALARM_FLOAT_PROBE, now);

#if MOTOR_ALARM_FLOAT_PROBE
	/* Chi SysTick ghi PUPDR cua GPIOC sau Init (PC khac chua dung). */
	alarm_pulled_up = (pulled_up != 0U) ? 0U : 1U;
	MOTOR_ALARM_PORT->PUPDR = (MOTOR_ALARM_PORT->PUPDR & ~MOTOR_ALARM_PUPDR_MASK) |
	                          ((alarm_pulled_up != 0U) ? MOTOR_ALARM_PUPDR_UP : MOTOR_ALARM_PUPDR_DOWN);
#endif
}
