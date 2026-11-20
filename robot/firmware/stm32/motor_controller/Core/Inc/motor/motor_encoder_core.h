#ifndef MOTOR_ENCODER_CORE_H
#define MOTOR_ENCODER_CORE_H

#include <stdint.h>

/* Encoder quadrature cua 2 motor banh xe - logic thuan, khong HAL, test duoc
 * tren host (tests/test_motor_encoder_core.c). Phan timer/GPIO va nhip lay
 * mau nam o motor_encoder.c.
 *
 * Timer phan cung (TIM3 trai, TIM8 phai, encoder mode x4) dem tung canh A/B;
 * CPU khong xu ly tung xung. SysTick 1 kHz doc CNT 16-bit va cong don thanh
 * bo dem 32-bit o day (16 bit tran sau 32768 count, toi da ~30k count/s o
 * toc do tran -> doc moi 1 ms con du xa).
 *
 * CHI GIAM SAT: khong module nao dung so nay de dieu khien motor, va
 * odometry van tinh tu so xung STEP. Chieu dem, so count/vong va count/STEP
 * CHUA duoc hieu chuan tren robot (docs/ENCODER_HBS57H.md). */

/* = 0: khong dong vao TIM3/TIM8, PB4/PB5/PC6/PB8/PB9 (giu nhu sau reset,
 *      receiver tat nho tro keo xuong 10k o PB9), FB bao DISABLED. */
#ifndef MOTOR_ENCODER_ENABLE
#define MOTOR_ENCODER_ENABLE 1
#endif

/* = 1: bat receiver AM26LV32E (PB9 cao) ngay khi boot, sau khi timer da san
 *      sang. = 0: de tat, bat bang lenh ENC,<seq>,ON. */
#ifndef MOTOR_ENCODER_RX_ON_AT_BOOT
#define MOTOR_ENCODER_RX_ON_AT_BOOT 1
#endif

/* ICxF cua timer (RM0440, TIMx_CCMR1). Voi CKD=1 (f_DTS = 16 MHz):
 * 0x9 = lay mau f_DTS/8, N=8 -> bo qua gai ngan hon ~4 us. Canh A/B o toc do
 * tran (12 kHz STEP, gia dinh 2.5 count/STEP) cach nhau ~33 us: du bien.
 * Tang len 0xC (~8 us) neu TERR tang vi nhieu; giam neu dem thieu o toc do cao. */
#ifndef MOTOR_ENCODER_INPUT_FILTER
#define MOTOR_ENCODER_INPUT_FILTER 0x9U
#endif

/* Cua so tinh toc do (so mau 1 ms). 100 ms: 1 count/cua so = 10 count/s. */
#ifndef MOTOR_ENCODER_SPEED_WINDOW_MS
#define MOTOR_ENCODER_SPEED_WINDOW_MS 100U
#endif

#define MOTOR_ENCODER_CHANNELS 2U   /* 0 = banh trai (M1, TIM3), 1 = banh phai (M2, TIM8) */

/* Ma trang thai, gui nguyen so trong FB. Khong doi gia tri da phat hanh. */
typedef enum
{
	MOTOR_ENCODER_DISABLED = 0,   /* build voi MOTOR_ENCODER_ENABLE=0 */
	MOTOR_ENCODER_RX_OFF   = 1,   /* timer chay, receiver tat (PB9 thap) */
	MOTOR_ENCODER_RX_ON    = 2    /* timer chay, receiver bat */
} MotorEncoderState;

typedef struct
{
	int32_t count;               /* count tich luy tu luc boot, tu tran int32 */
	int32_t speed_cps;           /* count/s tren cua so MOTOR_ENCODER_SPEED_WINDOW_MS */
	uint32_t transition_errors;  /* so ms co co TERRF (A va B doi cung luc) */
	uint8_t level_a;             /* muc chan A/B o mau gan nhat */
	uint8_t level_b;
} MotorEncoderStatus;

/* enabled = 0: trang thai DISABLED, Sample() khong lam gi. */
void MotorEncoderCore_Init(uint8_t enabled);

/* Chi ghi nhan trang thai receiver (motor_encoder.c lai chan PB9). */
void MotorEncoderCore_SetReceiver(uint8_t on);
uint8_t MotorEncoderCore_GetState(void);

/* Goi tu ngat (1 kHz). raw = TIMx->CNT 16-bit. Lan goi dau tien sau Init chi
 * lay moc, khong cong count. transition_error = 1 neu co TERRF tu lan truoc. */
void MotorEncoderCore_Sample(uint8_t channel, uint16_t raw, uint8_t transition_error,
                             uint8_t level_a, uint8_t level_b);

/* Goi tu vong lap chinh: chup trang thai nhat quan, khong tat ngat. */
void MotorEncoderCore_GetStatus(uint8_t channel, MotorEncoderStatus *out);
const char *MotorEncoderCore_StateText(uint8_t state);

#endif
