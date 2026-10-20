/**
 * Host-only stand-in for the CubeMX main.h, used by tests/test_motor_core.c.
 * Provides just the HAL types/macros motor_core.c and motor_hal.h touch.
 * NOT compiled into the firmware (CubeIDE and the Makefile build Core/ only).
 */
#ifndef TEST_STUB_MAIN_H
#define TEST_STUB_MAIN_H

#include <stdint.h>

typedef struct { volatile uint32_t BSRR; } GPIO_TypeDef;
typedef struct { volatile uint32_t SR; volatile uint32_t DIER; } TIM_TypeDef;
typedef struct { TIM_TypeDef *Instance; } TIM_HandleTypeDef;

#define TIM_FLAG_UPDATE 0x1U
#define TIM_IT_UPDATE   0x1U

/* Single-threaded host test: the ISR is called explicitly, so masking
 * interrupts is a no-op that only counts critical sections. */
extern int g_irq_disabled;
static inline void __disable_irq(void) { g_irq_disabled++; }
static inline void __enable_irq(void)  { g_irq_disabled--; }

/* HAL timebase / clock used by usb_protocol.c (tests/test_usb_protocol.c). */
uint32_t HAL_GetTick(void);
void HAL_Delay(uint32_t ms);
extern uint32_t SystemCoreClock;

#endif
