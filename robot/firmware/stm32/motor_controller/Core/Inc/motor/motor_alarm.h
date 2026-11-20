#ifndef MOTOR_ALARM_H
#define MOTOR_ALARM_H

#include "motor/motor_alarm_core.h"

/* Ngo vao ALM cua 2 driver HBS57H (xem docs/PIN_MAP.md, muc ALM).
 *   PC10 = ALM banh trai (M1), J_MCU_R pad 16
 *   PC11 = ALM banh phai (M2), J_MCU_R pad 17
 * Mach moi kenh: 3V3 -- 10k -- ALM+ -- 1k -- GPIO; ALM- -- GND STM32.
 * Chan chi cau hinh o day (khong co trong .ioc), giong TIM6 trong head.c.
 *
 * CHI GIAM SAT. Khong module nao dung trang thai nay de dung motor hay
 * tat contactor. Bat bao ve chu dong la mot thay doi rieng, sau khi da thu
 * loi that tren phan cung. */

/* Cau hinh (MOTOR_ALARM_ENABLE, _FLOAT_PROBE, _ACTIVE_LEVEL, _DEBOUNCE_MS)
 * nam trong motor_alarm_core.h. */

void MotorAlarm_Init(void);
/* Goi tu SysTick_Handler sau HAL_IncTick(). Khong lam gi truoc Init. */
void MotorAlarm_Tick(void);

#endif
