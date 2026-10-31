#ifndef HEAD_CORE_H
#define HEAD_CORE_H

/* Dau quay camera PAN/TILT: hai motor buoc qua driver DRV8825.
 *
 * Lop logic thuan (test duoc tren host: tests/test_head_core.c). Khong goi HAL;
 * chi ghi BSRR cua cac chan STEP/DIR/nEN mo ta trong HeadAxisPins.
 *
 * Mo hinh dieu khien: VI TRI. Host gui goc dich (centi-do), firmware tu chay
 * profile hinh thang (tang toc / toc do toi da / giam toc) va dung dung so
 * buoc. Tick HEAD_TICK_HZ do TIM6 goi (head.c), profile cap nhat moi
 * HEAD_PROFILE_DIV tick.
 *
 * KHONG CO CONG TAC HANH TRINH / ENCODER. Moc vi tri lay bang VAT CAN CO KHI
 * (HEAD,<seq>,HOME): moi truc quay cham ve phia vat can qua ca hanh trinh lon
 * nhat co the (HEAD_*_HOME_SEEK_CDEG); khi da ep vao vat can, motor buoc truot
 * buoc tai cho (tieng rung "te te" la binh thuong). Het quang seek, firmware
 * coi truc dang nam o vat can = +/-HEAD_*_HOME_OFFSET_CDEG roi chay ve 0 do.
 * Sau do vi tri la vong ho: dem so xung da phat. "Da toi dich" trong FB nghia
 * la "da phat du xung", khong phai da xac nhan bang cam bien. Tat driver
 * (OFF) lam motor tha troi nen mat moc -> phai HOME (hoac ZERO tay) lai.
 *
 * Moi thong so co khi duoi day la GIA TRI MAC DINH CHUA DO. Sua cho khop phan
 * cung (jumper vi buoc tren de DRV8825, ti so truyen, gioi han co khi) truoc
 * khi chay that.
 */

#include "main.h"
#include <stdint.h>

/* ---- Tan so ---------------------------------------------------------------- */
#ifndef HEAD_TICK_HZ
#define HEAD_TICK_HZ 10000U          /* TIM6 update, 100 us/tick */
#endif

#ifndef HEAD_PROFILE_DIV
#define HEAD_PROFILE_DIV 10U         /* profile cap nhat 1 kHz */
#endif

/* Xung STEP cao 1 tick (100 us) roi thap it nhat 1 tick -> tran HEAD_TICK_HZ/2.
 * DRV8825 can >= 1.9 us cao va >= 1.9 us thap, du thoai mai. */
#ifndef HEAD_MAX_STEP_HZ
#define HEAD_MAX_STEP_HZ 4000.0f
#endif

/* ---- Co khi (MAC DINH, CHUA DO) ------------------------------------------- */
#ifndef HEAD_MOTOR_STEPS_PER_REV
#define HEAD_MOTOR_STEPS_PER_REV 200.0f   /* motor 1.8 do/buoc */
#endif

#ifndef HEAD_MICROSTEP
#define HEAD_MICROSTEP 16.0f              /* jumper M0-M2 tren de DRV8825 */
#endif

#ifndef HEAD_PAN_GEAR_RATIO
#define HEAD_PAN_GEAR_RATIO 3.0f          /* hop so hanh tinh 3:1 (vong motor / vong truc PAN) */
#endif

#ifndef HEAD_TILT_GEAR_RATIO
#define HEAD_TILT_GEAR_RATIO 2.0f         /* hop so hanh tinh 2:1 */
#endif

/* ---- Homing bang vat can co khi --------------------------------------------
 * HOME_DIR: chieu quay toi vat can (+1 = chieu duong: PAN quay trai, TILT
 * ngoc len; -1 = chieu am).
 * HOME_OFFSET: vat can nam cach 0 do bao nhieu (centi-do). Vat can o 180 do
 * -> 18000: sau homing truc chay nguoc 180 do de ve 0.
 * HOME_SEEK: quang duong quay toi vat can, PHAI lon hon khoang cach xa nhat
 * co the tu vi tri bat ky toi vat can (truc chi co mot vat can va co the dang
 * o ngay phia ben kia no -> gan 360 do) cong du tru. Quay thua sau khi cham
 * vat can chi la truot buoc tai cho. */
/* PAN (23/10/2026): vong co vat can chiem 170..190 do. Homing quay sang
 * PHAI (chieu am) toi canh vat can o -170 do (= 190 do), roi dem +170 do ve 0.
 * Canh con lai o +170 do chan phia trai. Xa nhat toi canh phai: dau dang sat
 * canh trai (+170) -> 340 do; seek 360 do (du 20 do). */
#ifndef HEAD_PAN_HOME_DIR
#define HEAD_PAN_HOME_DIR (-1)
#endif
/* TILT (23/10/2026): hanh trinh 30 do len / 30 do xuong, vat can cung o
 * +30 va -30. Homing cui XUONG toi vat can -30 roi dem +30 ve 0. Xa nhat toi
 * vat can duoi: dau dang ngoc het (+30) -> 60 do; seek 70 do (du 10 do).
 * Muon homing ngoc LEN thi dat HEAD_TILT_HOME_DIR = 1. */
#ifndef HEAD_TILT_HOME_DIR
#define HEAD_TILT_HOME_DIR (-1)
#endif
#ifndef HEAD_PAN_HOME_OFFSET_CDEG
#define HEAD_PAN_HOME_OFFSET_CDEG 17000
#endif
#ifndef HEAD_TILT_HOME_OFFSET_CDEG
#define HEAD_TILT_HOME_OFFSET_CDEG 3000
#endif
#ifndef HEAD_PAN_HOME_SEEK_CDEG
#define HEAD_PAN_HOME_SEEK_CDEG 36000
#endif
#ifndef HEAD_TILT_HOME_SEEK_CDEG
#define HEAD_TILT_HOME_SEEK_CDEG 7000
#endif
/* Toc do luc tim vat can: cham de dap vao vat can nhe va truot buoc em. */
#ifndef HEAD_HOME_SPEED_DPS
#define HEAD_HOME_SPEED_DPS 20.0f
#endif

/* Gioi han goc tinh tu moc 0, centi-do. Phai NHO HON khoang cach toi vat can
 * de khong bao gio dap vao vat can khi chay binh thuong. Lenh goc tuyet doi
 * vuot gioi han bi tu choi; STEP/JOG thi dung lai o gioi han. */
/* PAN: +/-165 do, cach hai canh vat can (+/-170) 5 do. */
#ifndef HEAD_PAN_LIMIT_CDEG
#define HEAD_PAN_LIMIT_CDEG 16500
#endif

/* TILT: +/-25 do, cach vat can +/-30 do 5 do (sai so homing toi ~3.6 do qua
 * hop so 2:1). Muon dung du +/-30 thi dat vat can o +/-35 va doi OFFSET 3500,
 * LIMIT 3000, SEEK 8000. */
#ifndef HEAD_TILT_LIMIT_CDEG
#define HEAD_TILT_LIMIT_CDEG 2500
#endif

#if (HEAD_PAN_LIMIT_CDEG >= HEAD_PAN_HOME_OFFSET_CDEG) || (HEAD_TILT_LIMIT_CDEG >= HEAD_TILT_HOME_OFFSET_CDEG)
#error "HEAD_*_LIMIT_CDEG phai nho hon HEAD_*_HOME_OFFSET_CDEG (khong duoc cham vat can)"
#endif
#if (HEAD_PAN_HOME_SEEK_CDEG <= HEAD_PAN_HOME_OFFSET_CDEG) || (HEAD_TILT_HOME_SEEK_CDEG <= HEAD_TILT_HOME_OFFSET_CDEG)
#error "HEAD_*_HOME_SEEK_CDEG phai lon hon HEAD_*_HOME_OFFSET_CDEG"
#endif

/* ---- Nut bam (STEP / JOG) ------------------------------------------------------
 * Nhan 1 lan: HEAD,<seq>,STEP,<n_pan>,<n_tilt> quay n BUOC DU cua motor
 * (1 buoc du = HEAD_MICROSTEP vi buoc; qua hop so: PAN 1.8/3 = 0.6 do,
 * TILT 1.8/2 = 0.9 do).
 * Giu nut: HEAD,<seq>,JOG,<dir_pan>,<dir_tilt> (dir -1/0/1) quay lien tuc;
 * host phai gui lai it nhat moi HEAD_JOG_TIMEOUT_MS, im lang qua han thi
 * firmware tu giam toc dung (deadman: mat mang khong lam dau quay chay mai). */
#ifndef HEAD_JOG_SPEED_DPS
#define HEAD_JOG_SPEED_DPS 30.0f
#endif
#ifndef HEAD_JOG_TIMEOUT_MS
#define HEAD_JOG_TIMEOUT_MS 300U
#endif

/* Toc do / gia toc tai truc ra (do/s, do/s^2). */
#ifndef HEAD_MAX_SPEED_DPS
#define HEAD_MAX_SPEED_DPS 60.0f
#endif

#ifndef HEAD_ACCEL_DPS2
#define HEAD_ACCEL_DPS2 120.0f
#endif

/* Dao chieu DIR neu motor quay nguoc quy uoc:
 *   PAN  duong = quay trai (nhin tu tren xuong, nguoc chieu kim dong ho, REP-103)
 *   TILT duong = ngoc len */
#ifndef HEAD_PAN_DIR_INVERT
#define HEAD_PAN_DIR_INVERT 0U
#endif

#ifndef HEAD_TILT_DIR_INVERT
#define HEAD_TILT_DIR_INVERT 0U
#endif

/* ---- Kieu du lieu ------------------------------------------------------------ */
#define HEAD_AXIS_PAN  0U
#define HEAD_AXIS_TILT 1U
#define HEAD_AXIS_COUNT 2U

typedef struct
{
	GPIO_TypeDef *step_port;
	uint16_t step_pin;
	GPIO_TypeDef *dir_port;
	uint16_t dir_pin;
	uint8_t dir_invert;
	GPIO_TypeDef *en_port;   /* nEN cua DRV8825, tich cuc MUC THAP */
	uint16_t en_pin;
} HeadAxisPins;

typedef enum
{
	HEAD_OK = 0,
	HEAD_ERR_NOT_ZEROED,     /* chua ZERO (hoac da OFF) -> khong co moc vi tri */
	HEAD_ERR_LIMIT,          /* goc dich ngoai gioi han */
	HEAD_ERR_BUSY            /* dang HOME, hoac ZERO/HOME khi dang chay */
} HeadResult;

typedef enum
{
	HEAD_STATE_OFF = 0,      /* driver tat (nEN cao), khong giu luc, khong co moc */
	HEAD_STATE_IDLE = 1,     /* driver bat, co moc, ca hai truc da phat du xung toi dich */
	HEAD_STATE_MOVING = 2,
	HEAD_STATE_HOMING = 3,   /* dang tim vat can / chay ve 0 */
	HEAD_STATE_NO_REF = 4    /* driver bat (giu luc) nhung KHONG co moc: HOME bi STOP giua chung */
} HeadState;

typedef struct
{
	HeadState state;
	uint8_t zeroed;
	int32_t pan_cdeg;        /* vi tri hien tai (tu so xung), centi-do */
	int32_t tilt_cdeg;
} HeadStatus;

/* ---- API ------------------------------------------------------------------- */
/* Khoi tao: copy chan, nEN cao (tat), STEP thap, DIR theo chieu duong. */
void HeadCore_Init(const HeadAxisPins *pan, const HeadAxisPins *tilt);

/* Dat goc dich (centi-do, tuyet doi tu moc ZERO) cho ca hai truc. */
HeadResult HeadCore_Command(int32_t pan_cdeg, int32_t tilt_cdeg);

/* Vi tri hien tai = 0 cho ca hai truc, bat driver de giu luc.
 * Cach du phong: nguoi van hanh tu can dau ve huong FRONT/thang bang. */
HeadResult HeadCore_Zero(void);

/* Bat driver, tim vat can roi chay ve 0 (ca hai truc song song).
 * Tien trinh do HeadCore_Service() day; xong thi state = IDLE, co moc. */
HeadResult HeadCore_Home(void);

/* Nhan nut: dich chuyen tuong doi n buoc du (co dau), cong don vao dich hien
 * tai, chan o gioi han. Can co moc. */
HeadResult HeadCore_Step(int32_t pan_full_steps, int32_t tilt_full_steps);

/* Giu nut: dir -1/0/1 moi truc. Truc co dir != 0 chay ve gioi han o toc do
 * JOG; dir = 0 giam toc dung. Moi lan goi gia han deadman. Can co moc. */
HeadResult HeadCore_Jog(int8_t pan_dir, int8_t tilt_dir, uint32_t now_ms);

/* Goi moi vong main loop: chuyen pha homing, het han deadman JOG. */
void HeadCore_Service(uint32_t now_ms);

/* Tat driver ngay (nEN cao), dung phat xung, mat moc. */
void HeadCore_Off(void);

/* Giam toc ve 0 roi dung (giu driver bat). Dung cho lenh STOP.
 * Giu moc, TRU khi dang HOME: homing bi huy va state = NO_REF. */
void HeadCore_Halt(void);

void HeadCore_GetStatus(HeadStatus *status);

/* Truy van theo truc (test / chan doan). */
int32_t HeadCore_GetPositionSteps(uint8_t axis);
int32_t HeadCore_GetTargetSteps(uint8_t axis);
uint8_t HeadCore_IsMoving(uint8_t axis);
float   HeadCore_StepsPerCdeg(uint8_t axis);

/* Goi tu TIM6 ISR (head.c), moi tick HEAD_TICK_HZ. */
void HeadCore_HandleTick(void);

#endif
