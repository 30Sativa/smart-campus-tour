#include "contactor/contactor.h"

#include "main.h"

static uint8_t contactor_commanded_on = 0U;

void Contactor_Init(void)
{
	Contactor_Off();
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
