#ifndef HEAD_H
#define HEAD_H

/* Lop phan cung dau quay PAN/TILT: GPIO + TIM6 (tick cho head_core).
 *
 * Chan (PCB robot-pan-tilt-chan-cho-6-9, 19/10/2026):
 *   PAN : PA8 = STEP, PA15 = DIR, PB2  = nEN   (J_PAN 1/2/3)
 *   TILT: PA9 = STEP, PA7  = DIR, PB10 = nEN   (J_TILT 1/2/3)
 * STEP/DIR di thang tu STM32 qua R11-R14 220 ohm (khong qua 74HCT245).
 * nEN co dien tro keo len 3V3 (R9/R10): MCU reset/chua khoi tao = driver tat.
 *
 * TIM6 khong co trong .ioc: cau hinh truc tiep o head.c, giong motor_hal.c
 * cau hinh lai TIM2. Neu sau nay bat TIM6/DAC trong CubeMX se xung dot voi
 * TIM6_DAC_IRQHandler trong stm32g4xx_it.c (USER CODE). */

void Head_Init(void);
void Head_HandleTimerInterrupt(void);

#endif
