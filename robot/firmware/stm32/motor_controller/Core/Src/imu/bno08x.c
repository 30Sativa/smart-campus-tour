/**
 ******************************************************************************
 * @file    bno08x.c
 * @brief   Driver BNO080/085 qua I2C bit-bang tren PB6/PB7.
 ******************************************************************************
 */
#include "imu/bno08x.h"
#include "imu/bno08x_parse.h"
#include "main.h"
#include <string.h>
#include <math.h>

/* ---- cau hinh chan ---- */
#define BB_PORT     GPIOB
#define BB_SCL      GPIO_PIN_6      /* PB6 */
#define BB_SDA      GPIO_PIN_7      /* PB7 */
#define BB_RST_PORT GPIOA
#define BB_RST_PIN  GPIO_PIN_4      /* PA4 */
#define BB_INT_PIN  GPIO_PIN_5      /* PA5 */

/* De tiet kiem chan STM32: BNO08x chi can SCL/SDA.
 * RST co the keo len 3V3, INT co the bo trong neu poll bang bit-bang. */
#ifndef BNO08X_USE_HW_RST
#define BNO08X_USE_HW_RST 0
#endif

#ifndef BNO08X_USE_INT_PIN
#define BNO08X_USE_INT_PIN 0
#endif

#define BNO_ADDR    0x4A            /* ADD=GND */

#define SHTP_CH_EXECUTABLE             1
#define EXEC_CMD_RESET                 0x01
#define SHTP_CH_CONTROL                 2
#define SHTP_REPORT_PRODUCT_ID_REQUEST  0xF9
#define SHTP_REPORT_PRODUCT_ID_RESPONSE 0xF8

#define BB_STRETCH_TIMEOUT_MS  25U

/* Goi SHTP lon nhat BNO08x co the gui: advertisement luc reset ~276 byte.
 * Header lon hon nguong nay coi nhu rac (vd bus doc ra toan 0xFF -> 0x7FFF). */
#define SHTP_MAX_PACKET        512U

#define SHTP_CH_REPORTS                 3
#define SHTP_REPORT_BASE_TIMESTAMP      0xFB
#define SENSOR_REPORTID_ROTATION_VECTOR 0x05
#define SENSOR_REPORTID_GAME_ROTATION_VECTOR 0x08
#define SHTP_REPORT_SET_FEATURE_COMMAND 0xFD
#define Q14_SCALE   (1.0f / 16384.0f)

#ifndef BNO08X_YAW_TIMEOUT_MS
#define BNO08X_YAW_TIMEOUT_MS 200U
#endif

static uint8_t s_seq[8];
static float   s_last_yaw_raw = 0.0f;  /* yaw tho tu IMU, chua tru offset */
static float   s_yaw_offset   = 0.0f;  /* offset tare do host dat */
static uint8_t s_yaw_valid = 0U;
static uint32_t s_last_yaw_ms = 0U;
static uint32_t s_rv_count = 0U;   /* so mau trong cua so 1s dang chay */
static uint32_t s_rv_rate  = 0U;   /* so mau/giay cua cua so gan nhat */
static uint32_t s_rate_t0  = 0U;
static uint8_t  s_accuracy = 0U;   /* muc tin cay 0..3 cua mau gan nhat */
static uint32_t s_bus_warn = 0U;   /* so lan STOP ket thuc bat thuong */
static uint32_t s_bus_recover_n = 0U; /* so lan phai phuc hoi bus */
static uint8_t  s_dwt_ok = 0U;     /* CYCCNT co that su chay khong */
static uint32_t s_nop_loops = 1U;  /* duong du phong khi DWT chet */

/* ---- delay & line control ----
 * I2C uses open-drain lines: writing HIGH releases the line, writing LOW
 * actively pulls it low.  The board must provide external pull-ups to 3V3.
 */
/* Nua chu ky clock, tinh bang micro giay.
 * 5us -> khoang 90-100 kHz, dung chuan I2C standard mode.  BNO08x chiu duoc
 * toi 400 kHz nen con nhieu bien.
 *
 * Ban cu dung "for (volatile int i=0; i<150; i++)" -- so vong chon dai, va
 * thoi gian thuc te phu thuoc ca tan so CPU lan muc optimize khi bien dich.
 * Do ra thi no cho 250us/nua chu ky = 2 kHz, cham hon chuan 50 lan.
 * Dem chu ky CPU qua DWT thi doc lap voi ca hai thu do. */
#ifndef BNO08X_BB_HALF_PERIOD_US
#define BNO08X_BB_HALF_PERIOD_US 5U
#endif

static uint32_t s_cycles_per_us = 1U;

static void bb_delay(void)
{
    if (s_dwt_ok != 0U)
    {
        uint32_t start = DWT->CYCCNT;
        uint32_t ticks = BNO08X_BB_HALF_PERIOD_US * s_cycles_per_us;
        /* Tran vong lap: DWT co hong giua chung thi van thoat, khong treo. */
        uint32_t guard = (ticks * 4U) + 1000U;
        while (((uint32_t)(DWT->CYCCNT - start) < ticks) && (guard != 0U)) { guard--; }
        return;
    }
    for (volatile uint32_t i = 0U; i < s_nop_loops; i++) { __NOP(); }
}

static void scl_release(void)
{
    HAL_GPIO_WritePin(BB_PORT, BB_SCL, GPIO_PIN_SET);
}
static void scl_low(void)
{
    HAL_GPIO_WritePin(BB_PORT, BB_SCL, GPIO_PIN_RESET);
}
static void sda_release(void)
{
    HAL_GPIO_WritePin(BB_PORT, BB_SDA, GPIO_PIN_SET);
}
static void sda_low(void)
{
    HAL_GPIO_WritePin(BB_PORT, BB_SDA, GPIO_PIN_RESET);
}
static uint8_t sda_read(void) { return (BB_PORT->IDR & BB_SDA) ? 1U : 0U; }
static uint8_t scl_read(void) { return (BB_PORT->IDR & BB_SCL) ? 1U : 0U; }

static uint8_t scl_release_wait(void)
{
    scl_release();
    if (scl_read()) return 1U;   /* duong nhanh: khong bi stretch */
    uint32_t start = HAL_GetTick();
    while (scl_read() == 0U)
    {
        if ((HAL_GetTick() - start) >= BB_STRETCH_TIMEOUT_MS) return 0U;
    }
    return 1U;
}

/* ---- I2C primitives ---- */
/* Slave giu SDA thap (dien hinh: MCU reset giua luc no dang day bit ra) thi
 * bus khoa cung vinh vien.  Dap 9 xung clock cho no day not byte va nha SDA,
 * roi phat STOP -- day la ky thuat phuc hoi bus I2C tieu chuan. */
static void bus_recover(void)
{
    s_bus_recover_n++;

    sda_release();
    for (int i = 0; i < 9; i++)
    {
        scl_low();     bb_delay();
        scl_release(); bb_delay();
        if (sda_read()) break;
    }

    sda_low();     bb_delay();
    scl_release(); bb_delay();
    sda_release(); bb_delay();
}

static uint8_t bb_start(void)
{
    sda_release();
    if (!scl_release_wait()) return 0U;
    bb_delay();

    if (!sda_read())
    {
        /* Bus dang bi giu thap.  Thu phuc hoi dung mot lan roi kiem tra lai. */
        bus_recover();
        sda_release();
        if (!scl_release_wait()) return 0U;
        bb_delay();
        if (!sda_read()) return 0U;
    }

    sda_low();     bb_delay();
    scl_low();     bb_delay();
    return 1U;
}

/* STOP luon duoc phat.  Bat thuong thi dem vao s_bus_warn chu KHONG dung lam
 * dieu kien vut du lieu -- ban cu tra ve sda_read() va i2c_read dung no de
 * return 0, tuc la nem di ca goi vua doc xong (va goi do da bi tieu thu khoi
 * thiet bi, khong doc lai duoc). */
static void bb_stop(void)
{
    sda_low();          bb_delay();
    if (!scl_release_wait()) s_bus_warn++;
    bb_delay();
    sda_release();      bb_delay();
    if (!sda_read()) s_bus_warn++;
}
static uint8_t bb_write_bit(uint8_t b)
{
    if (b) sda_release(); else sda_low();
    bb_delay();
    if (!scl_release_wait()) { scl_low(); return 0U; }
    bb_delay();
    scl_low();
    return 1U;
}
static uint8_t bb_read_bit(uint8_t *bit)
{
    sda_release();
    bb_delay();
    if (!scl_release_wait()) { scl_low(); return 0U; }
    bb_delay();
    *bit = sda_read();
    scl_low();
    return 1U;
}
static uint8_t bb_write_byte(uint8_t v)
{
    uint8_t ack;
    for (int i = 0; i < 8; i++)
    {
        if (!bb_write_bit((v & 0x80) ? 1U : 0U)) return 0U;
        v <<= 1;
    }
    return bb_read_bit(&ack) && (ack == 0U);
}
static uint8_t bb_read_byte(uint8_t ack, uint8_t *value)
{
    uint8_t v = 0;
    uint8_t bit;
    for (int i = 0; i < 8; i++)
    {
        if (!bb_read_bit(&bit)) return 0U;
        v = (uint8_t)((v << 1) | bit);
    }
    if (!bb_write_bit(ack ? 0U : 1U)) return 0U;
    *value = v;
    return 1U;
}
static uint8_t i2c_write(uint8_t addr7, const uint8_t *d, uint16_t n)
{
    if (!bb_start()) return 0U;
    if (!bb_write_byte((uint8_t)(addr7 << 1))) { bb_stop(); return 0U; }
    for (uint16_t i = 0; i < n; i++)
        if (!bb_write_byte(d[i])) { bb_stop(); return 0U; }
    bb_stop();
    return 1U;
}
static uint16_t i2c_read(uint8_t addr7, uint8_t *buf, uint16_t n)
{
    if ((buf == NULL) || (n == 0U)) return 0U;
    if (!bb_start()) return 0U;
    if (!bb_write_byte((uint8_t)((addr7 << 1) | 1U))) { bb_stop(); return 0U; }
    for (uint16_t i = 0; i < n; i++)
        if (!bb_read_byte((i + 1U < n) ? 1U : 0U, &buf[i])) { bb_stop(); return 0U; }
    bb_stop();
    return n;   /* doc du byte la thanh cong, khong phu thuoc trang thai STOP */
}
static uint8_t i2c_ping(uint8_t addr7)
{
    uint8_t ack;
    if (!bb_start()) return 0U;
    ack = bb_write_byte((uint8_t)((addr7 << 1) | 0U));
    bb_stop();
    return ack;
}

/* ---- SHTP ---- */
static int shtp_read(uint8_t *buf, uint16_t cap)
{
    uint8_t hdr[4];
    if ((buf == NULL) || (cap < 8U)) return -1;
    if (i2c_read(BNO_ADDR, hdr, 4) != 4) return -1;
    uint16_t total = (uint16_t)((hdr[0] | (hdr[1] << 8)) & 0x7FFF);

    /* BNO08x cho doc tung phan.  Sau khi doc 4 byte header dau tien, moi lan
     * doc tiep se tra ve 4 byte header lap lai roi den phan payload con lai. */
    if (total <= 4U) return 0;
    if (total > SHTP_MAX_PACKET) return -1;   /* header rac */

    if (total > cap)
    {
        /* Goi to hon buffer -- dien hinh la advertisement (~276 byte) BNO08x
         * gui ngay sau reset/cap nguon.  BAT BUOC phai doc bo cho het: neu
         * chi return loi ma khong doc, no nam mai o dau hang doi va chan
         * moi goi phia sau, khien self-test va rotation vector khong bao gio
         * toi noi. */
        uint16_t remain = (uint16_t)(total - 4U);
        uint16_t chunk_max = (uint16_t)(cap - 4U);
        while (remain > 0U)
        {
            uint16_t chunk = (remain > chunk_max) ? chunk_max : remain;
            if (i2c_read(BNO_ADDR, buf, (uint16_t)(chunk + 4U)) != (chunk + 4U)) return -1;
            remain = (uint16_t)(remain - chunk);
        }
        return -2;  /* da bo qua goi nay, con goi khac phia sau */
    }

    uint16_t got = i2c_read(BNO_ADDR, buf, total);
    if (got != total) return -1;
    return (int)(got - 4U);
}
static uint8_t shtp_send_pid_request(void)
{
    uint8_t pkt[6] = {6, 0, SHTP_CH_CONTROL, 0, SHTP_REPORT_PRODUCT_ID_REQUEST, 0};
    pkt[3] = s_seq[SHTP_CH_CONTROL]++;
    return i2c_write(BNO_ADDR, pkt, 6);
}

/* ---- public ---- */
void BNO08x_Init(void)
{
    __HAL_RCC_GPIOB_CLK_ENABLE();
    __HAL_RCC_GPIOA_CLK_ENABLE();

    /* Bo dem chu ky cho bb_delay. sr04t.c cung bat cai nay, bat lai vo hai. */
    CoreDebug->DEMCR |= CoreDebug_DEMCR_TRCENA_Msk;
    DWT->CTRL |= DWT_CTRL_CYCCNTENA_Msk;
    s_cycles_per_us = SystemCoreClock / 1000000U;
    if (s_cycles_per_us == 0U) s_cycles_per_us = 1U;

    /* CYCCNT khong phai luc nao cung chay (vai dong Cortex-M can debugger,
     * hoac code khac tat TRCENA).  Kiem tra that su thay vi tin tuong. */
    {
        uint32_t before = DWT->CYCCNT;
        for (volatile int i = 0; i < 50; i++) { __NOP(); }
        s_dwt_ok = (DWT->CYCCNT != before) ? 1U : 0U;
    }
    /* Duong du phong: uoc ~6 chu ky moi vong lap voi bien volatile. */
    s_nop_loops = (BNO08X_BB_HALF_PERIOD_US * s_cycles_per_us) / 6U;
    if (s_nop_loops == 0U) s_nop_loops = 1U;
    memset(s_seq, 0, sizeof(s_seq));
    s_last_yaw_raw = 0.0f;
    s_yaw_offset = 0.0f;
    s_yaw_valid = 0U;
    s_last_yaw_ms = 0U;
    s_rv_count = 0U;
    s_rv_rate = 0U;
    s_rate_t0 = 0U;
    s_accuracy = 0U;
    s_bus_warn = 0U;
    s_bus_recover_n = 0U;

#if BNO08X_USE_HW_RST || BNO08X_USE_INT_PIN
    GPIO_InitTypeDef g = {0};
#endif

#if BNO08X_USE_HW_RST
    g.Pin = BB_RST_PIN; g.Mode = GPIO_MODE_OUTPUT_PP; g.Pull = GPIO_NOPULL; g.Speed = GPIO_SPEED_FREQ_LOW;
    HAL_GPIO_Init(BB_RST_PORT, &g);
    HAL_GPIO_WritePin(BB_RST_PORT, BB_RST_PIN, GPIO_PIN_SET);
#endif

#if BNO08X_USE_INT_PIN
    g.Pin = BB_INT_PIN; g.Mode = GPIO_MODE_INPUT; g.Pull = GPIO_PULLUP;
    HAL_GPIO_Init(BB_RST_PORT, &g);
#endif

    GPIO_InitTypeDef bus = {0};
    bus.Pin = BB_SCL | BB_SDA;
    bus.Mode = GPIO_MODE_OUTPUT_OD;
    bus.Pull = GPIO_PULLUP;
    bus.Speed = GPIO_SPEED_FREQ_LOW;
    HAL_GPIO_Init(BB_PORT, &bus);
    sda_release();
    scl_release();
    HAL_Delay(5);
}

static void bno_reset(void)
{
#if BNO08X_USE_HW_RST
    HAL_GPIO_WritePin(BB_RST_PORT, BB_RST_PIN, GPIO_PIN_RESET);
    HAL_Delay(20);
    HAL_GPIO_WritePin(BB_RST_PORT, BB_RST_PIN, GPIO_PIN_SET);
#else
    uint8_t pkt[5];
    pkt[0] = 5; pkt[1] = 0;
    pkt[2] = SHTP_CH_EXECUTABLE;
    pkt[3] = s_seq[SHTP_CH_EXECUTABLE]++;
    pkt[4] = EXEC_CMD_RESET;
    (void)i2c_write(BNO_ADDR, pkt, 5);
#endif
    HAL_Delay(300);
}

uint8_t BNO08x_SelfTest(uint8_t *sw_major, uint8_t *sw_minor)
{
    uint8_t buf[256];

    if (!i2c_ping(BNO_ADDR)) return 0U;

    bno_reset();

    for (uint8_t i = 0; i < 12; i++) { (void)shtp_read(buf, sizeof(buf)); HAL_Delay(20); }

    if (!shtp_send_pid_request()) return 0U;
    HAL_Delay(50);

    for (uint8_t i = 0; i < 8; i++)
    {
        int plen = shtp_read(buf, sizeof(buf));
        if (plen <= 0) { HAL_Delay(20); continue; }
        if (buf[2] == SHTP_CH_CONTROL && buf[4] == SHTP_REPORT_PRODUCT_ID_RESPONSE)
        {
            if (sw_major) *sw_major = buf[6];
            if (sw_minor) *sw_minor = buf[7];
            return 1U;
        }
        HAL_Delay(20);
    }
    return 0U;
}

uint8_t BNO08x_Diag(void)
{
    return i2c_ping(BNO_ADDR) ? 0U : 1U;
}

void BNO08x_BusIdle(uint8_t *sda_high, uint8_t *scl_high)
{
    sda_release();
    scl_release();
    bb_delay();
    bb_delay();
    if (sda_high) *sda_high = sda_read();
    if (scl_high) *scl_high = scl_read();
}

uint32_t BNO08x_BusClockHz(void)
{
    uint32_t t0;
    uint32_t bits = 0U;

    /* Dap clock khong tai trong 100ms de do tan so that.
     * SDA giu muc cao suot nen day chi la xung clock rong -- slave bo qua,
     * giong ky thuat bus recovery chuan. */
    sda_release();
    t0 = HAL_GetTick();
    while ((uint32_t)(HAL_GetTick() - t0) < 100U)
    {
        for (int i = 0; i < 50; i++)
        {
            scl_low();     bb_delay();
            scl_release(); bb_delay();
            bits++;
        }
    }
    scl_release();
    return bits * 10U;   /* bit/giay */
}

uint16_t BNO08x_PeekPacketLen(uint8_t *channel)
{
    uint8_t hdr[4];
    if (channel) *channel = 0xFFU;
    if (i2c_read(BNO_ADDR, hdr, 4) != 4) return 0xFFFFU;
    if (channel) *channel = hdr[2];
    return (uint16_t)((hdr[0] | (hdr[1] << 8)) & 0x7FFF);
}

void BNO08x_BusPullTest(uint8_t *sda_ext, uint8_t *scl_ext)
{
    GPIO_InitTypeDef g = {0};

    sda_release();
    scl_release();

    /* Input + pull-down noi: pull-up ngoai (4.7k) se thang pull-down noi (~40k). */
    g.Pin = BB_SCL | BB_SDA;
    g.Mode = GPIO_MODE_INPUT;
    g.Pull = GPIO_PULLDOWN;
    g.Speed = GPIO_SPEED_FREQ_LOW;
    HAL_GPIO_Init(BB_PORT, &g);
    HAL_Delay(5);

    if (sda_ext) *sda_ext = sda_read();
    if (scl_ext) *scl_ext = scl_read();

    /* Tra lai cau hinh bus. */
    g.Mode = GPIO_MODE_OUTPUT_OD;
    g.Pull = GPIO_PULLUP;
    HAL_GPIO_Init(BB_PORT, &g);
    sda_release();
    scl_release();
    HAL_Delay(2);
}

uint8_t BNO08x_ScanBus(uint8_t *found, uint8_t max_found)
{
    uint8_t n = 0U;

    for (uint8_t a = 0x08U; a <= 0x77U; a++)
    {
        if (i2c_ping(a))
        {
            if ((found != NULL) && (n < max_found)) found[n] = a;
            n++;
        }
    }
    return n;
}

/* ---- Rotation Vector ---- */
static uint8_t shtp_set_feature(uint8_t report_id, uint32_t interval_us)
{
    uint8_t pkt[BNO08X_SET_FEATURE_LEN];
    uint16_t len = bno08x_build_set_feature(pkt, s_seq[SHTP_CH_CONTROL]++,
                                            report_id, interval_us);
    return i2c_write(BNO_ADDR, pkt, len);
}

uint8_t BNO08x_EnableRotationVector(uint16_t interval_ms)
{
    if (interval_ms == 0U) interval_ms = 20U;
    return shtp_set_feature(SENSOR_REPORTID_ROTATION_VECTOR,
                            (uint32_t)interval_ms * 1000U);
}

uint8_t BNO08x_ReadRotationVector(float *qi, float *qj, float *qk, float *qr,
                                  BNO08x_Euler *euler)
{
    uint8_t buf[256];
    uint8_t got = 0U;

    /* Xa HET hang doi moi lan goi, giu lai mau moi nhat.
     * Quan trong: goi khong phai channel 3 (control, executable) va goi qua co
     * van phai doc bo roi di tiep -- dung lai o do thi hang doi cu day len va
     * heading tre dan (do duoc bang PKT trong lenh DIAG). */
    for (uint8_t n = 0U; n < 8U; n++)
    {
        int plen = shtp_read(buf, sizeof(buf));
        if (plen == 0) break;        /* hang doi rong */
        if (plen == -2) continue;    /* goi qua co, da bo qua */
        if (plen < 0) break;         /* loi bus */
        if (buf[2] != SHTP_CH_REPORTS) continue;

        const uint8_t *rep = bno08x_find_report_last(buf + 4, plen,
                                                     SENSOR_REPORTID_ROTATION_VECTOR);
        if (rep == NULL) continue;

        int16_t ri = (int16_t)(rep[4]  | (rep[5]  << 8));
        int16_t rj = (int16_t)(rep[6]  | (rep[7]  << 8));
        int16_t rk = (int16_t)(rep[8]  | (rep[9]  << 8));
        int16_t rr = (int16_t)(rep[10] | (rep[11] << 8));

        float fi = (float)ri * Q14_SCALE;
        float fj = (float)rj * Q14_SCALE;
        float fk = (float)rk * Q14_SCALE;
        float fr = (float)rr * Q14_SCALE;

        /* Ap tare vao ca quaternion de no khop voi yaw da tare. */
        if (qi && qj && qk && qr)
        {
            *qi = fi; *qj = fj; *qk = fk; *qr = fr;
            bno08x_apply_yaw_offset_quat(qi, qj, qk, qr, s_yaw_offset);
        }

        s_accuracy = bno08x_report_accuracy(rep);

        float yaw_raw = 0.0f, pitch = 0.0f, roll = 0.0f;
        bno08x_quat_to_euler(fi, fj, fk, fr, &yaw_raw, &pitch, &roll);

        uint32_t now = HAL_GetTick();
        s_last_yaw_raw = yaw_raw;
        s_yaw_valid = 1U;
        s_last_yaw_ms = now;
        got = 1U;

        s_rv_count += (uint32_t)bno08x_count_reports(
                          buf + 4, plen, SENSOR_REPORTID_ROTATION_VECTOR);
        {
            /* Chia cho thoi gian cua so THAT.  Ban cu bao so dem cua mot khoang
             * co the dai hon 1 giay nhu the la moi giay -> bao thieu khi mau thua. */
            uint32_t dt = (uint32_t)(now - s_rate_t0);
            if (dt >= 1000U)
            {
                s_rv_rate = (s_rv_count * 1000U) / dt;
                s_rv_count = 0U;
                s_rate_t0 = now;
            }
        }

        if (euler)
        {
            euler->yaw   = bno08x_wrap180(yaw_raw - s_yaw_offset);
            euler->pitch = pitch;
            euler->roll  = roll;
        }
    }
    return got;
}

uint32_t BNO08x_GetSampleRate(void)
{
    return s_rv_rate;
}

uint8_t BNO08x_GetAccuracy(void)
{
    return s_accuracy;
}

uint32_t BNO08x_GetBusWarnCount(void)
{
    return s_bus_warn;
}

uint32_t BNO08x_GetBusRecoverCount(void)
{
    return s_bus_recover_n;
}

uint8_t BNO08x_IsDwtOk(void)
{
    return s_dwt_ok;
}

float BNO08x_GetLastYaw(uint8_t *valid)
{
    uint8_t fresh = (uint8_t)(
        (s_yaw_valid != 0U) &&
        ((uint32_t)(HAL_GetTick() - s_last_yaw_ms) <= BNO08X_YAW_TIMEOUT_MS));
    if (valid) *valid = fresh;
    return bno08x_wrap180(s_last_yaw_raw - s_yaw_offset);
}

void BNO08x_SetYawDeg(float yaw_deg)
{
    s_yaw_offset = bno08x_tare_offset(s_last_yaw_raw, yaw_deg);
}

void BNO08x_ClearYawOffset(void)
{
    s_yaw_offset = 0.0f;
}

float BNO08x_GetYawOffset(void)
{
    return s_yaw_offset;
}
