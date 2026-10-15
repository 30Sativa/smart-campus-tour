#ifndef MOTOR_HAL_H
#define MOTOR_HAL_H

#include "main.h"
#include <stdint.h>

/* Lop phan cung: GPIO step/dir + TIM2 base timer.
 * Khong biet gi ve logic "motor", chi thao tac chan va timer. */

#ifndef MOTOR_BASE_TIMER_HZ
#define MOTOR_BASE_TIMER_HZ    50000U
#endif

#ifndef MOTOR_STEP_PULSE_TICKS
#define MOTOR_STEP_PULSE_TICKS 1U
#endif

/* Mo ta chan cua mot motor (step + dir). */
typedef struct
{
	GPIO_TypeDef *step_port;
	uint16_t step_pin;
	GPIO_TypeDef *dir_port;
	uint16_t dir_pin;
	uint8_t dir_invert;
} MotorHalPins;

/* Cau hinh chan step (PA0, PA2) va base timer TIM2. Tra ve base timer hz da chot. */
void MotorHal_ConfigStepPins(const MotorHalPins *left, const MotorHalPins *right);
void MotorHal_ConfigBaseTimer(void);

/* Tan so dem thuc te cua base timer sau khi config (core dung de tinh phase). */
uint32_t MotorHal_GetBaseTimerHz(void);

/* Thao tac chan muc thap. */
void MotorHal_WriteDir(const MotorHalPins *pins, int8_t direction);
void MotorHal_WriteStepHigh(const MotorHalPins *pins);
void MotorHal_WriteStepLow(const MotorHalPins *pins);

/* Same writes as MotorHal_WriteStepHigh/Low, as macros for the 50 kHz ISR:
 * a call into this -O0 translation unit costs more than the store itself. */
#define MOTOR_HAL_STEP_HIGH(pins) ((pins)->step_port->BSRR = (uint32_t)(pins)->step_pin)
#define MOTOR_HAL_STEP_LOW(pins)  ((pins)->step_port->BSRR = ((uint32_t)(pins)->step_pin << 16U))

#endif
