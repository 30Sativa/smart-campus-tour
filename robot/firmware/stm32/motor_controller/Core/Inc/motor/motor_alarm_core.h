#ifndef MOTOR_ALARM_CORE_H
#define MOTOR_ALARM_CORE_H

#include <stdint.h>

/* Loc tin hieu ALM cua 2 driver HBS57H banh xe - logic thuan, khong HAL,
 * test duoc tren host (tests/test_motor_alarm_core.c). Phan chan GPIO va
 * nhip lay mau nam o motor_alarm.c.
 *
 * CHI GIAM SAT: module nay khong dung motor, khong dong contactor. Trang thai
 * duoc dua len FB (robot/docs/PROTOCOL_FB.md) va lenh ALM,<seq>.
 *
 * Moi kenh duoc doc HAI lan lien tiep: mot lan voi pull-up noi, mot lan voi
 * pull-down noi (motor_alarm.c dao pull moi tick). Mach ngoai (10k keo len
 * 3V3, opto cua driver keo xuong) manh hon pull noi ~40k nhieu, nen chan
 * DANG DUOC LAI cho cung muc o ca hai lan. Chan tha noi (chua han, dut day
 * 1k) di theo pull noi -> hai lan khac nhau -> MOTOR_ALARM_NO_SIGNAL. Nho vay
 * chan chua dau KHONG bao gio bi doc thanh OK hay ALARM. */

/* = 0: khong dong vao PC10/PC11 (giu analog sau reset), FB bao DISABLED. */
#ifndef MOTOR_ALARM_ENABLE
#define MOTOR_ALARM_ENABLE 1
#endif

/* = 1: dao pull-up/pull-down noi moi ms de nhan ra chan tha noi.
 * = 0: giu pull-up noi co dinh; chan chua dau doc thanh OK (khong bao gia
 *      ALARM khi MOTOR_ALARM_ACTIVE_LEVEL=0) nhung khong phat hien dut day. */
#ifndef MOTOR_ALARM_FLOAT_PROBE
#define MOTOR_ALARM_FLOAT_PROBE 1
#endif

/* Muc dien ap nghia la "driver dang bao loi". 0 = LOW (du kien: opto ALM
 * dan khi loi). Do 18/11/2026: driver binh thuong, den xanh -> ALM+ ~3.3V
 * (HIGH). Trang thai LOI CHUA DUOC THU tren phan cung. Neu thu loi thuc te
 * cho ket qua nguoc lai, build voi -DMOTOR_ALARM_ACTIVE_LEVEL=1. */
#ifndef MOTOR_ALARM_ACTIVE_LEVEL
#define MOTOR_ALARM_ACTIVE_LEVEL 0U
#endif

/* So mau lien tiep (1 mau/ms) phai giong nhau truoc khi doi trang thai. */
#ifndef MOTOR_ALARM_DEBOUNCE_MS
#define MOTOR_ALARM_DEBOUNCE_MS 20U
#endif

#define MOTOR_ALARM_CHANNELS 2U   /* 0 = banh trai (M1), 1 = banh phai (M2) */

/* Ma trang thai, gui nguyen so trong FB. Khong doi gia tri da phat hanh. */
typedef enum
{
	MOTOR_ALARM_DISABLED  = 0,   /* build voi MOTOR_ALARM_ENABLE=0 */
	MOTOR_ALARM_UNKNOWN   = 1,   /* vua khoi dong, chua du mau */
	MOTOR_ALARM_OK        = 2,   /* chan duoc lai, muc KHONG phai muc loi */
	MOTOR_ALARM_ALARM     = 3,   /* chan duoc lai, dung muc loi */
	MOTOR_ALARM_NO_SIGNAL = 4    /* chan tha noi: chua dau / dut day */
} MotorAlarmState;

typedef struct
{
	uint8_t state;            /* MotorAlarmState sau loc */
	uint8_t raw_pu;           /* lan doc gan nhat voi pull-up noi */
	uint8_t raw_pd;           /* lan doc gan nhat voi pull-down noi */
	uint32_t trips;           /* so lan VAO ALARM tu luc boot */
	uint32_t glitches;        /* so lan mau lech roi quay lai truoc khi du loc */
	uint32_t last_change_ms;  /* HAL tick luc doi trang thai gan nhat (0 = chua) */
	uint32_t last_trip_ms;    /* HAL tick luc vao ALARM gan nhat (0 = chua) */
} MotorAlarmStatus;

/* enabled = 0: moi kenh DISABLED, Sample() khong lam gi. */
void MotorAlarmCore_Init(uint8_t enabled);

/* Goi tu ngat (1 kHz). level = muc chan doc duoc, pulled_up = pull noi dang
 * bat luc doc (1 = pull-up, 0 = pull-down). probe = 0: khong dao pull, coi
 * moi lan doc la cap PU/PD giong nhau (khong phat hien duoc tha noi). */
void MotorAlarmCore_Sample(uint8_t channel, uint8_t level, uint8_t pulled_up,
                           uint8_t probe, uint32_t now_ms);

/* Goi tu vong lap chinh: chup trang thai nhat quan, khong tat ngat. */
void MotorAlarmCore_GetStatus(uint8_t channel, MotorAlarmStatus *out);
uint8_t MotorAlarmCore_IsEnabled(void);
const char *MotorAlarmCore_StateText(uint8_t state);

#endif
