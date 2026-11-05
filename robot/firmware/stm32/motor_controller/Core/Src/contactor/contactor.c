#include "contactor/contactor.h"

#include "main.h"

static uint8_t contactor_commanded_on = 0U;

/* = 1: contactor BAT ngay khi STM32 khoi dong (05/11/2026). Host van tat/bat
 * duoc bang CONTACTOR,<seq>,OFF|ON. Dat 0 de quay lai hanh vi cu (tat luc boot). */
#ifndef CONTACTOR_ON_AT_BOOT
#define CONTACTOR_ON_AT_BOOT 1
#endif

void Contactor_Init(void)
{
#if CONTACTOR_ON_AT_BOOT
	Contactor_On();
#else
	Contactor_Off();
#endif
}

void Contactor_On(void)
{
	HAL_GPIO_WritePin(CONTACTOR_EN_GPIO_Port, CONTACTOR_EN_Pin, GPIO_PIN_SET);
	contactor_commanded_on = 1U;
}

void Contactor_Off(void)
{
	HAL_GPIO_WritePin(CONTACTOR_EN_GPIO_Port, CONTACTOR_EN_Pin, GPIO_PIN_RESET);
	contactor_commanded_on = 0U;
}

uint8_t Contactor_IsCommandedOn(void)
{
	return contactor_commanded_on;
}
