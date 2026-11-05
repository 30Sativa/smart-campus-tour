#include "head/head.h"
#include "head/head_core.h"

#include "main.h"

/* Uu tien ngat: thap hon TIM2 (1, xung banh xe), ngang EXTI sonar (2). */
#ifndef HEAD_TIM_IRQ_PRIORITY
#define HEAD_TIM_IRQ_PRIORITY 2U
#endif

static const HeadAxisPins head_pan_pins =
{
	PA8_PAN_STEP_GPIO_Port, PA8_PAN_STEP_Pin,
	PA15_PAN_DIR_GPIO_Port, PA15_PAN_DIR_Pin,
	HEAD_PAN_DIR_INVERT,
	PAN_nEN_GPIO_Port, PAN_nEN_Pin
};

static const HeadAxisPins head_tilt_pins =
{
	PA9_TILT_STEP_GPIO_Port, PA9_TILT_STEP_Pin,
	PA7_TILT_DIR_GPIO_Port, PA7_TILT_DIR_Pin,
	HEAD_TILT_DIR_INVERT,
	TILT_nEN_GPIO_Port, TILT_nEN_Pin
};

static uint32_t Head_GetTimerClockHz(void)
{
	RCC_ClkInitTypeDef clock_config;
	uint32_t flash_latency;
	uint32_t timer_clock_hz = HAL_RCC_GetPCLK1Freq();

	HAL_RCC_GetClockConfig(&clock_config, &flash_latency);
	if (clock_config.APB1CLKDivider != RCC_HCLK_DIV1)
	{
		timer_clock_hz *= 2U;
	}
	return timer_clock_hz;
}

static void Head_ConfigPins(void)
{
	GPIO_InitTypeDef g = {0};

	__HAL_RCC_GPIOA_CLK_ENABLE();
	__HAL_RCC_GPIOB_CLK_ENABLE();

	/* nEN: chot muc CAO truoc khi chuyen sang output -> khong co xung bat
	 * driver luc khoi dong. MX_GPIO_Init da lam viec nay; lam lai o day de
	 * khong phu thuoc ban generate cua CubeMX. */
	HAL_GPIO_WritePin(PAN_nEN_GPIO_Port, PAN_nEN_Pin, GPIO_PIN_SET);
	HAL_GPIO_WritePin(TILT_nEN_GPIO_Port, TILT_nEN_Pin, GPIO_PIN_SET);
	g.Pin = PAN_nEN_Pin | TILT_nEN_Pin;   /* cung GPIOB */
	g.Mode = GPIO_MODE_OUTPUT_PP;
	g.Pull = GPIO_NOPULL;
	g.Speed = GPIO_SPEED_FREQ_LOW;
	HAL_GPIO_Init(GPIOB, &g);

	HAL_GPIO_WritePin(GPIOA, PA8_PAN_STEP_Pin | PA15_PAN_DIR_Pin |
	                         PA9_TILT_STEP_Pin | PA7_TILT_DIR_Pin, GPIO_PIN_RESET);
	g.Pin = PA8_PAN_STEP_Pin | PA15_PAN_DIR_Pin | PA9_TILT_STEP_Pin | PA7_TILT_DIR_Pin;
	g.Mode = GPIO_MODE_OUTPUT_PP;
	g.Pull = GPIO_NOPULL;      /* PA15 mac dinh co pull-up (JTDI): bo di */
	g.Speed = GPIO_SPEED_FREQ_LOW;   /* R 220 ohm noi tiep da lam mem canh */
	HAL_GPIO_Init(GPIOA, &g);
}

static void Head_ConfigTimer(void)
{
	uint32_t timer_clock_hz = Head_GetTimerClockHz();
	uint32_t prescaler_div = timer_clock_hz / 1000000U;   /* dem 1 MHz */
	uint32_t period_ticks;

	if (prescaler_div == 0U) prescaler_div = 1U;
	period_ticks = (timer_clock_hz / prescaler_div) / HEAD_TICK_HZ;
	if (period_ticks == 0U) period_ticks = 1U;

	__HAL_RCC_TIM6_CLK_ENABLE();
	TIM6->CR1 = 0U;
	TIM6->DIER = 0U;
	TIM6->PSC = prescaler_div - 1U;
	TIM6->ARR = period_ticks - 1U;
	TIM6->CNT = 0U;
	TIM6->EGR = TIM_EGR_UG;           /* nap PSC/ARR ngay */
	TIM6->SR = 0U;                    /* UG cung bat UIF: xoa truoc khi bat ngat */
	TIM6->DIER = TIM_DIER_UIE;

	HAL_NVIC_SetPriority(TIM6_DAC_IRQn, HEAD_TIM_IRQ_PRIORITY, 0U);
	HAL_NVIC_EnableIRQ(TIM6_DAC_IRQn);
	TIM6->CR1 = TIM_CR1_CEN;
}

void Head_Init(void)
{
	Head_ConfigPins();
	HeadCore_Init(&head_pan_pins, &head_tilt_pins);   /* nEN cao, chua ZERO */
	Head_ConfigTimer();
}

/* 10 kHz ISR entry: build -O2 ke ca cau hinh Debug -O0 (xem motor.c). */
__attribute__((optimize("O2")))
void Head_HandleTimerInterrupt(void)
{
	if ((TIM6->SR & TIM_SR_UIF) != 0U)
	{
		TIM6->SR = ~TIM_SR_UIF;   /* rc_w0: ghi mat na, khong doc-sua-ghi */
		HeadCore_HandleTick();
	}
}
