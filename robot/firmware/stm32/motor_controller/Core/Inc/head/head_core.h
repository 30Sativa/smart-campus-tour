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
 * Sai so homing: khi ep vao vat can roi dung, roto nam o mot vi tri can bang
 * cach vat can toi da +/-2 buoc du. Vi tri do lap lai giong nhau neu quang
 * seek luon ket thuc o cung pha dien cua driver (HEAD_HOME_PHASE_ALIGN), nen
 * moc 0 lap lai moi lan HOME va chi can hieu chinh HOME_OFFSET mot lan.
 *
 * Thong so co khi duoi day theo phan cung 05/11/2026 (motor 17HD4401S,
 * DRV8825 buoc du). Doi phan cung thi sua cho khop.
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

/* ---- Co khi (05/11/2026) ---------------------------------------------------
 * Ca hai truc: motor 17HD4401S (NEMA17 42x42, 1.8 do/buoc, 0.42 Nm).
 *   PAN : hop so hanh tinh 3:1 -> 1 buoc du = 0.6 do tai truc ra.
 *   TILT: gan truc tiep vao dau gia -> 1 buoc du = 1.8 do.
 * DRV8825 KHONG cam jumper M0-M2 = buoc du -> HEAD_MICROSTEP 1. Moi goc bi
 * lam tron toi buoc gan nhat (PAN 0.6 do, TILT 1.8 do).
 * Cam jumper vi buoc thi doi HEAD_MICROSTEP cho khop (M2 cao = 1/16 -> 16):
 * chay em hon, it rung cong huong va it mat buoc hon buoc du. */
#ifndef HEAD_MOTOR_STEPS_PER_REV
#define HEAD_MOTOR_STEPS_PER_REV 200.0f   /* motor 1.8 do/buoc */
#endif

#ifndef HEAD_MICROSTEP
#define HEAD_MICROSTEP 1.0f               /* jumper M0-M2 tren de DRV8825: khong cam = buoc du */
#endif

#ifndef HEAD_PAN_GEAR_RATIO
#define HEAD_PAN_GEAR_RATIO 3.0f          /* hop so hanh tinh 3:1 (vong motor / vong truc PAN) */
#endif

#ifndef HEAD_TILT_GEAR_RATIO
#define HEAD_TILT_GEAR_RATIO 1.0f         /* gan truc tiep, khong hop so */
#endif

/* ---- Homing bang vat can co khi --------------------------------------------
 * HOME_DIR: chieu quay toi vat can (+1 = chieu duong: PAN quay trai, TILT
 * ngua len; -1 = chieu am: PAN quay phai, TILT cui xuong).
 * HOME_SEEK: quang quay toi vat can. Quay thua sau khi cham vat can chi la
 * truot buoc tai cho ("te te"), nhung cang it cang do mon va do rung.
 * HOME_OFFSET: khoang cach tu canh vat can ve 0 do (centi-do). Day la NUT
 * HIEU CHINH: HOME xong ma dau chua thang thi sua so nay (moc lap lai, xem
 * HEAD_HOME_PHASE_ALIGN).
 *
 * PAN (05/11/2026): vat can (khoi vang) o phia sau, canh phai cach 0 do 174
 * do ve ben phai. Homing quay PHAI 190 do toi vat can, roi quay TRAI 174 do
 * ve 0. Gia dinh canh trai cua vat can doi xung o 174 do ben trai.
 * CHU Y: 190 do chi du khi dau dang nam trong khoang [174 phai .. 16 trai].
 * Lech trai hon 16 do thi het quang seek ma chua cham vat can -> moc 0 sai.
 * stm32_bridge dua dau ve 0 truoc khi tat (head_park_on_shutdown) de lan
 * khoi dong sau nam trong khoang nay. Muon HOME duoc tu MOI vi tri thi dat
 * HEAD_PAN_HOME_SEEK_CDEG = 36000 (truot buoc lau hon).
 *
 * TILT (05/11/2026): vat can o phia CUI 20 do. Homing cui xuong toi vat can
 * roi ngua len 20 do ve thang (20 do = 11 buoc du, lam tron 19.8 do).
 * SEEK 44 do: tu vi tri ngua cao nhat co the (~20 do) toi vat can duoi la
 * 40 do, du 4 do. */
#ifndef HEAD_PAN_HOME_DIR
#define HEAD_PAN_HOME_DIR (-1)
#endif
#ifndef HEAD_PAN_HOME_SEEK_CDEG
#define HEAD_PAN_HOME_SEEK_CDEG 19000
#endif
#ifndef HEAD_PAN_HOME_OFFSET_CDEG
#define HEAD_PAN_HOME_OFFSET_CDEG 17400
#endif

#ifndef HEAD_TILT_HOME_DIR
#define HEAD_TILT_HOME_DIR (-1)
#endif
#ifndef HEAD_TILT_HOME_SEEK_CDEG
#define HEAD_TILT_HOME_SEEK_CDEG 4400
#endif
#ifndef HEAD_TILT_HOME_OFFSET_CDEG
#define HEAD_TILT_HOME_OFFSET_CDEG 2000
#endif

/* Toc do luc tim vat can (truc ra): cham de cham nhe va truot buoc em. */
#ifndef HEAD_HOME_SPEED_DPS
#define HEAD_HOME_SPEED_DPS 20.0f
#endif

/* Het quang seek: dung yen chung nay (driver van giu) cho roto het rung va
 * nam yen o vi tri can bang canh vat can, roi moi quay ve 0. */
#ifndef HEAD_HOME_SETTLE_MS
#define HEAD_HOME_SETTLE_MS 200U
#endif

/* = 1: keo dai quang seek them 0..(4*HEAD_MICROSTEP - 1) xung de no luon ket
 * thuc o cung pha dien cua bo dem buoc trong DRV8825 (chu ky 4 buoc du).
 * Roto bi ep vao vat can se nam o vi tri can bang cua pha do, nen moc 0 lap
 * lai giong nhau moi lan HOME (thay vi lech ngau nhien toi +/-2 buoc du).
 * Gia dinh: DRV8825 va STM32 cung duoc cap nguon (bo dem cua ca hai bat dau
 * tu 0). Chi reset STM32 (nap code, rut USB) ma driver van co nguon thi lan
 * HOME sau co the lech toi +/-2 buoc; tat/bat nguon ca robot de lap lai. */
#ifndef HEAD_HOME_PHASE_ALIGN
#define HEAD_HOME_PHASE_ALIGN 1
#endif

/* Gioi han goc tinh tu moc 0, centi-do. Phai NHO HON khoang cach toi vat can
 * de khong bao gio ep vao vat can khi chay binh thuong. Lenh goc tuyet doi
 * vuot gioi han bi tu choi; STEP/JOG thi dung lai o gioi han. */
/* PAN: +/-170 do, cach canh vat can (174 do) 4 do. */
#ifndef HEAD_PAN_LIMIT_CDEG
#define HEAD_PAN_LIMIT_CDEG 17000
#endif

/* TILT: +/-18 do (cui 18, ngua 18) = 10 buoc du; vat can cui o 20 do. Neu sai
 * so homing day gioi han cham vat can thi ep < 2 buoc du: motor buoc khong
 * truot, khong mat goc. Phia ngua khong co vat can trong firmware; neu co vat
 * can co khi phia tren thi no phai xa hon 18 do. */
#ifndef HEAD_TILT_LIMIT_CDEG
#define HEAD_TILT_LIMIT_CDEG 1800
#endif

#if (HEAD_PAN_LIMIT_CDEG >= HEAD_PAN_HOME_OFFSET_CDEG) || (HEAD_TILT_LIMIT_CDEG >= HEAD_TILT_HOME_OFFSET_CDEG)
#error "HEAD_*_LIMIT_CDEG phai nho hon HEAD_*_HOME_OFFSET_CDEG (khong duoc cham vat can)"
#endif
#if (HEAD_PAN_HOME_SEEK_CDEG <= HEAD_PAN_HOME_OFFSET_CDEG) || (HEAD_TILT_HOME_SEEK_CDEG <= HEAD_TILT_HOME_OFFSET_CDEG)
#error "HEAD_*_HOME_SEEK_CDEG phai lon hon HEAD_*_HOME_OFFSET_CDEG"
#endif

/* ---- Nut bam (STEP / JOG) ------------------------------------------------------
 * Nhan 1 lan: HEAD,<seq>,STEP,<n_pan>,<n_tilt> quay n BUOC DU cua motor
 * (1 buoc du = HEAD_MICROSTEP vi buoc; tai truc ra: PAN 1.8/3 = 0.6 do,
 * TILT 1.8 do).
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
 *   TILT duong = ngua len
 * Kiem tra truoc khi HOME lan dau: ZERO roi STEP +1 PAN phai quay TRAI,
 * STEP +1 TILT phai NGUA len; sai thi dat *_DIR_INVERT = 1U. */
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
	HEAD_STATE_HOMING = 3,   /* dang tim vat can / cho on dinh / chay ve 0 */
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
