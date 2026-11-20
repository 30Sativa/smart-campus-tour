#include "motor/motor_encoder.h"

#include "main.h"

/* MotorEncoder_Tick chay trong SysTick: giu ngan ke ca o build -O0. */
#pragma GCC optimize("O2")

#define ENC_LEFT_TIM        TIM3   /* PB4 = CH1 (A), PB5 = CH2 (B) */
#define ENC_RIGHT_TIM       TIM8   /* PC6 = CH1 (A), PB8 = CH2 (B) */
#define ENC_LEFT_A_PIN      4U     /* GPIOB */
#define ENC_LEFT_B_PIN      5U     /* GPIOB */
#define ENC_RIGHT_A_PIN     6U     /* GPIOC */
#define ENC_RIGHT_B_PIN     8U     /* GPIOB, cung la BOOT0 */
#define ENC_RX_EN_PIN       9U     /* GPIOB -> G cua AM26LV32E */

static volatile uint8_t encoder_hw_ready = 0U;

#if MOTOR_ENCODER_ENABLE
/* Encoder mode x4 (SMS=0011): dem moi canh cua ca A (TI1) lan B (TI2).
 * Khong dung ngat. Ghi thanh ghi truc tiep (khong co trong .ioc). */
static void MotorEncoder_ConfigTimer(TIM_TypeDef *tim)
{
	tim->CR1 = 0U;            /* tat dem; CKD=00 -> f_DTS = 16 MHz cho bo loc */
	tim->SMCR = 0U;
	tim->DIER = 0U;
	tim->CCER = 0U;
	tim->CCMR1 = (1UL << TIM_CCMR1_CC1S_Pos) |                       /* IC1 <- TI1 */
	             ((uint32_t)MOTOR_ENCODER_INPUT_FILTER << TIM_CCMR1_IC1F_Pos) |
	             (1UL << TIM_CCMR1_CC2S_Pos) |                       /* IC2 <- TI2 */
	             ((uint32_t)MOTOR_ENCODER_INPUT_FILTER << TIM_CCMR1_IC2F_Pos);
	tim->CCMR2 = 0U;
	tim->TISEL = 0U;          /* TI1/TI2 = chan CH1/CH2 */
	tim->ECR = 0U;            /* khong dung index */
	tim->PSC = 0U;
	tim->ARR = 0xFFFFU;
	/* CCxP = CCxNP = 0: khong dao cuc. Chieu dem theo day noi, chua hieu
	 * chuan; host doi dau bang tham so, khong sua o day. */
	tim->CCER = TIM_CCER_CC1E | TIM_CCER_CC2E;
	tim->SMCR = TIM_SMCR_SMS_0 | TIM_SMCR_SMS_1;
	tim->EGR = TIM_EGR_UG;
	tim->CNT = 0U;
	tim->SR = 0U;
	tim->CR1 = TIM_CR1_CEN;
}

static void MotorEncoder_ConfigInput(GPIO_TypeDef *port, uint32_t pin, uint8_t alternate)
{
	GPIO_InitTypeDef GPIO_InitStruct = {0};

	GPIO_InitStruct.Pin = (uint16_t)(1UL << pin);
	GPIO_InitStruct.Mode = GPIO_MODE_AF_PP;
	/* Keo xuong noi: receiver tat (ngo ra Hi-Z) thi chan o muc 0 on dinh,
	 * timer khong dem nhieu. Receiver bat lai qua 470R, thang ~40k de dang. */
	GPIO_InitStruct.Pull = GPIO_PULLDOWN;
	GPIO_InitStruct.Speed = GPIO_SPEED_FREQ_LOW;
	GPIO_InitStruct.Alternate = alternate;
	HAL_GPIO_Init(port, &GPIO_InitStruct);
}
#endif

void MotorEncoder_Init(void)
{
#if MOTOR_ENCODER_ENABLE
	GPIO_InitTypeDef GPIO_InitStruct = {0};

	encoder_hw_ready = 0U;
	MotorEncoderCore_Init(1U);

	__HAL_RCC_GPIOB_CLK_ENABLE();
	__HAL_RCC_GPIOC_CLK_ENABLE();

	/* 1. Giu receiver TAT trong luc cau hinh (10k ngoai da keo xuong). */
	GPIOB->BSRR = (1UL << ENC_RX_EN_PIN) << 16U;
	GPIO_InitStruct.Pin = (uint16_t)(1UL << ENC_RX_EN_PIN);
	GPIO_InitStruct.Mode = GPIO_MODE_OUTPUT_PP;
	GPIO_InitStruct.Pull = GPIO_NOPULL;
	GPIO_InitStruct.Speed = GPIO_SPEED_FREQ_LOW;
	HAL_GPIO_Init(GPIOB, &GPIO_InitStruct);

	/* 2. Timer o che do input truoc, roi moi giao chan cho AF: chan khong
	 *    bao gio bi timer lai ra. */
	__HAL_RCC_TIM3_CLK_ENABLE();
	__HAL_RCC_TIM8_CLK_ENABLE();
	MotorEncoder_ConfigTimer(ENC_LEFT_TIM);
	MotorEncoder_ConfigTimer(ENC_RIGHT_TIM);

	MotorEncoder_ConfigInput(GPIOB, ENC_LEFT_A_PIN, GPIO_AF2_TIM3);
	MotorEncoder_ConfigInput(GPIOB, ENC_LEFT_B_PIN, GPIO_AF2_TIM3);
	MotorEncoder_ConfigInput(GPIOC, ENC_RIGHT_A_PIN, GPIO_AF4_TIM8);
	MotorEncoder_ConfigInput(GPIOB, ENC_RIGHT_B_PIN, GPIO_AF10_TIM8);

#if MOTOR_ENCODER_RX_ON_AT_BOOT
	/* 3. Bat receiver, cho ngo ra va bo loc on dinh, roi xoa moi canh vua
	 *    sinh ra luc bat de count bat dau tu 0 sach. */
	GPIOB->BSRR = (1UL << ENC_RX_EN_PIN);
	MotorEncoderCore_SetReceiver(1U);
	HAL_Delay(2U);
#endif
	ENC_LEFT_TIM->CNT = 0U;
	ENC_RIGHT_TIM->CNT = 0U;
	ENC_LEFT_TIM->SR = 0U;
	ENC_RIGHT_TIM->SR = 0U;

	encoder_hw_ready = 1U;   /* mau SysTick dau tien chi lay moc CNT */
#else
	MotorEncoderCore_Init(0U);
#endif
}

void MotorEncoder_SetReceiver(uint8_t on)
{
#if MOTOR_ENCODER_ENABLE
	if (encoder_hw_ready == 0U)
	{
		return;
	}
	/* BSRR ghi nguyen tu: khong dua tranh voi ai doc-sua-ghi GPIOB. */
	GPIOB->BSRR = (on != 0U) ? (1UL << ENC_RX_EN_PIN) : ((1UL << ENC_RX_EN_PIN) << 16U);
	MotorEncoderCore_SetReceiver(on);
#else
	(void)on;
#endif
}

void MotorEncoder_Tick(void)
{
	uint32_t sr_left;
	uint32_t sr_right;
	uint32_t idr_b;
	uint32_t idr_c;
	uint16_t cnt_left;
	uint16_t cnt_right;

	if (encoder_hw_ready == 0U)
	{
		return;
	}

	cnt_left = (uint16_t)ENC_LEFT_TIM->CNT;
	cnt_right = (uint16_t)ENC_RIGHT_TIM->CNT;
	/* TERRF (RM0440): A va B doi cung luc - mat canh hoac nhieu. Co la rc_w0:
	 * ghi mat na, khong doc-sua-ghi (cac co CCx khac khong dung). */
	sr_left = ENC_LEFT_TIM->SR;
	if ((sr_left & TIM_SR_TERRF) != 0U)
	{
		ENC_LEFT_TIM->SR = ~TIM_SR_TERRF;
	}
	sr_right = ENC_RIGHT_TIM->SR;
	if ((sr_right & TIM_SR_TERRF) != 0U)
	{
		ENC_RIGHT_TIM->SR = ~TIM_SR_TERRF;
	}
	/* IDR van phan anh muc chan o che do AF. Chi doc, khong ghi GPIOC. */
	idr_b = GPIOB->IDR;
	idr_c = GPIOC->IDR;

	MotorEncoderCore_Sample(0U, cnt_left, (uint8_t)((sr_left & TIM_SR_TERRF) != 0U),
	                        (uint8_t)((idr_b >> ENC_LEFT_A_PIN) & 1U),
	                        (uint8_t)((idr_b >> ENC_LEFT_B_PIN) & 1U));
	MotorEncoderCore_Sample(1U, cnt_right, (uint8_t)((sr_right & TIM_SR_TERRF) != 0U),
	                        (uint8_t)((idr_c >> ENC_RIGHT_A_PIN) & 1U),
	                        (uint8_t)((idr_b >> ENC_RIGHT_B_PIN) & 1U));
}
