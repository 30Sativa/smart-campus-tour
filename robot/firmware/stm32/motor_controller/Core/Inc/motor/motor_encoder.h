#ifndef MOTOR_ENCODER_H
#define MOTOR_ENCODER_H

#include "motor/motor_encoder_core.h"

/* Encoder cua 2 motor HBS57H, doc song song voi driver qua AM26LV32E
 * (xem docs/ENCODER_HBS57H.md, docs/PIN_MAP.md muc Encoder).
 *   PB4 / PB5 = EA / EB banh trai (M1)  -> TIM3_CH1 / TIM3_CH2 (AF2)
 *   PC6 / PB8 = EA / EB banh phai (M2)  -> TIM8_CH1 (AF4) / TIM8_CH2 (AF10)
 *   PB9       = G (enable) AM26LV32E, muc cao = bat; 10k keo xuong ngoai
 *               nen receiver TAT trong luc reset/nap code.
 * PB8 la BOOT0: receiver tat luc reset nen 4Y khong lai PB8 khi chip lay
 * mau BOOT0. Timer va chan chi cau hinh o day (khong co trong .ioc), giong
 * TIM6 trong head.c va ALM trong motor_alarm.c.
 *
 * CHI GIAM SAT. Khong dung motor, khong doi odometry. */

/* Goi truoc MotorAlarm_Init(): PC6 cung o GPIOC, ma sau MotorAlarm_Init()
 * SysTick doc-sua-ghi GPIOC->PUPDR. */
void MotorEncoder_Init(void);
/* Bat/tat receiver (lenh ENC,<seq>,ON|OFF, de thu khi lap mach). */
void MotorEncoder_SetReceiver(uint8_t on);
/* Goi tu SysTick_Handler. Khong lam gi truoc Init. */
void MotorEncoder_Tick(void);

#endif
