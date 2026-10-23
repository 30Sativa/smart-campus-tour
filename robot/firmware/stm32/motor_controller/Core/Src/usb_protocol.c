#include "usb_protocol.h"

#include "contactor/contactor.h"
#include "head/head_core.h"
#include "main.h"
#include "motor/motor.h"
#include "imu/bno08x.h"
#include "sonar/sr04t.h"
#include "usb_rx_queue.h"
#include "usbd_cdc_if.h"

#include <ctype.h>
#include <stdarg.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

_Static_assert(MOTOR_ISR_WATCHDOG_MS > CMD_TIMEOUT_MS,
               "ISR watchdog is a backstop: it must outlast the main-loop CMD timeout");

#define PROTOCOL_TX_BUFFER_SIZE 256U  /* DIAG worst case ~236 B; truncation would drop "\r\n" */
#define PROTOCOL_TX_BUFFER_COUNT 2U

typedef enum
{
	PROTOCOL_STATUS_OK = 0,
	PROTOCOL_STATUS_STOP,
	PROTOCOL_STATUS_TIMEOUT,
	PROTOCOL_STATUS_ERR
} ProtocolStatus;

static char rx_active_line[USB_RX_LINE_SIZE];
static UsbRxQueue rx_queue;
static volatile uint32_t rx_active_line_len = 0U;
static volatile uint8_t rx_overflow = 0U;

static char tx_buffers[PROTOCOL_TX_BUFFER_COUNT][PROTOCOL_TX_BUFFER_SIZE];
static uint8_t tx_write_index = 0U;

static uint32_t last_seq = 0U;
static uint32_t last_valid_rx_ms = 0U;
static uint32_t last_feedback_sent_ms = 0U;
static uint32_t last_feedback_attempt_ms = 0U;
static uint32_t last_error_attempt_ms = 0U;
static ProtocolStatus protocol_status = PROTOCOL_STATUS_STOP;
static uint32_t last_head_seq = 0U;
/* Dong ERR dang cho gui (NULL = khong co). Chi giu loi moi nhat. */
static const char *pending_error = NULL;

#define ERR_BAD_COMMAND    "ERR,bad_command\r\n"
#define ERR_HEAD_NOT_ZERO  "ERR,head_not_zeroed\r\n"
#define ERR_HEAD_LIMIT     "ERR,head_limit\r\n"
#define ERR_HEAD_BUSY      "ERR,head_busy\r\n"

static void Protocol_CheckRxLine(void);
static void Protocol_CheckTimeout(uint32_t now_ms);
static void Protocol_CheckFeedback(uint32_t now_ms);
static void Protocol_ReportBadCommand(void);
static void Protocol_QueueError(const char *line);
static void Protocol_ProcessHead(char *tokens[], uint8_t token_count);
static uint8_t Protocol_ParseI32(const char *text, int32_t *value);
static uint8_t Protocol_TrySendPendingError(void);
static uint8_t Protocol_TrySendFeedback(uint32_t now_ms);
static uint8_t Protocol_TrySendRaw(const char *text);
static uint8_t Protocol_TrySendFormatted(const char *format, ...);
static uint8_t Protocol_TokenizeCsv(char *line, char *tokens[], uint8_t max_tokens, uint8_t *token_count);
static char *Protocol_Trim(char *text);
static uint8_t Protocol_EqualsIgnoreCase(const char *left, const char *right);
static uint8_t Protocol_ParseU32(const char *text, uint32_t *value);
static uint8_t Protocol_ParseFloat(const char *text, float *value);
static const char *Protocol_StatusText(void);

void Protocol_Init(void)
{
	uint32_t now = HAL_GetTick();

	__disable_irq();
	usb_rx_queue_reset(&rx_queue);
	rx_active_line_len = 0U;
	rx_overflow = 0U;
	__enable_irq();

	last_seq = 0U;
	last_valid_rx_ms = now;
	last_feedback_sent_ms = now;
	last_feedback_attempt_ms = now;
	last_error_attempt_ms = now - FEEDBACK_PERIOD_MS;
	protocol_status = PROTOCOL_STATUS_STOP;
	pending_error = NULL;
	last_head_seq = 0U;
}

void Protocol_Update(void)
{
	uint32_t now;

	Protocol_CheckRxLine();
	now = HAL_GetTick();
	Protocol_CheckTimeout(now);

	/* An ERR line only takes this iteration's USB slot when it was actually
	 * queued. While it waits (rate limit or CDC busy) FB keeps flowing:
	 * blocking FB here turned a burst of dropped lines into seconds without
	 * odometry, and the host then entered its feedback-timeout safe stop. */
	if (Protocol_TrySendPendingError() != 0U)
	{
		return;
	}

	Protocol_CheckFeedback(now);
}

void Protocol_ProcessRxByte(uint8_t b)
{
	char c = (char)b;

	if ((c == '\r') || (c == '\n'))
	{
		if (rx_overflow != 0U)
		{
			usb_rx_queue_mark_bad(&rx_queue);
			rx_overflow = 0U;
			rx_active_line_len = 0U;
		}
		else if (rx_active_line_len > 0U)
		{
			rx_active_line[rx_active_line_len] = '\0';
			/* Queue day -> dong bi bo va bad_ready duoc set ben trong. */
			(void)usb_rx_queue_push(&rx_queue, rx_active_line);
			rx_active_line_len = 0U;
		}
		return;
	}

	if ((c == '\b') || (b == 0x7FU))
	{
		if ((rx_overflow == 0U) && (rx_active_line_len > 0U))
		{
			rx_active_line_len--;
		}
		return;
	}

	if (rx_overflow != 0U)
	{
		return;
	}

	if (rx_active_line_len < (USB_RX_LINE_SIZE - 1U))
	{
		rx_active_line[rx_active_line_len] = c;
		rx_active_line_len++;
	}
	else
	{
		rx_overflow = 1U;
		rx_active_line_len = 0U;
	}
}

void Protocol_ProcessLine(char *line)
{
	char *tokens[5];
	uint8_t token_count = 0U;

	if ((line == NULL) || (Protocol_TokenizeCsv(line, tokens, 5U, &token_count) == 0U) || (token_count == 0U))
	{
		Protocol_ReportBadCommand();
		return;
	}

	if (Protocol_EqualsIgnoreCase(tokens[0], "CMD") != 0U)
	{
		uint32_t seq;
		float left_mm_s;
		float right_mm_s;

		if ((token_count != 4U) ||
			(Protocol_ParseU32(tokens[1], &seq) == 0U) ||
			(Protocol_ParseFloat(tokens[2], &left_mm_s) == 0U) ||
			(Protocol_ParseFloat(tokens[3], &right_mm_s) == 0U))
		{
			Protocol_ReportBadCommand();
			return;
		}

		last_seq = seq;
		last_valid_rx_ms = HAL_GetTick();
		protocol_status = PROTOCOL_STATUS_OK;
		Motor_FeedWatchdog();
		Motor_SetWheelSpeedMMPS(MOTOR_LEFT, left_mm_s);
		Motor_SetWheelSpeedMMPS(MOTOR_RIGHT, right_mm_s);
		return;
	}

	if (Protocol_EqualsIgnoreCase(tokens[0], "STOP") != 0U)
	{
		uint32_t seq;

		if ((token_count != 2U) || (Protocol_ParseU32(tokens[1], &seq) == 0U))
		{
			Protocol_ReportBadCommand();
			return;
		}

		last_seq = seq;
		last_valid_rx_ms = HAL_GetTick();
		protocol_status = PROTOCOL_STATUS_STOP;
		Motor_StopAll();
		/* KHONG dung dau quay o day: stm32_bridge gui STOP 20 Hz khi robot dung
		 * yen (giu firmware o trang thai STOP). Dung dau quay = HEAD,<seq>,STOP. */
		return;
	}

	/* CONTACTOR,<seq>,<ON|OFF> -> MOSFET contactor tren PA10 (truoc 23/10/2026
	 * la PB10; PB10 nay la TILT_nEN). Khong refresh watchdog motor: day khong
	 * phai lenh chuyen dong. Trang thai lenh nam o truong cuoi cua FB. */
	if (Protocol_EqualsIgnoreCase(tokens[0], "CONTACTOR") != 0U)
	{
		uint32_t seq;

		if ((token_count != 3U) ||
			(Protocol_ParseU32(tokens[1], &seq) == 0U) ||
			((Protocol_EqualsIgnoreCase(tokens[2], "ON") == 0U) &&
			 (Protocol_EqualsIgnoreCase(tokens[2], "OFF") == 0U)))
		{
			Protocol_ReportBadCommand();
			return;
		}

		last_seq = seq;
		if (Protocol_EqualsIgnoreCase(tokens[2], "ON") != 0U)
		{
			Contactor_On();
		}
		else
		{
			Contactor_Off();
		}
		return;
	}

	/* HEAD,<seq>,<pan_cdeg>,<tilt_cdeg> | HEAD,<seq>,HOME | HEAD,<seq>,ZERO |
	 * HEAD,<seq>,OFF | HEAD,<seq>,STOP | HEAD,<seq>,STEP,<n_pan>,<n_tilt> |
	 * HEAD,<seq>,JOG,<d_pan>,<d_tilt>
	 * Dau quay PAN/TILT, xem head/head_core.h va robot/docs/PROTOCOL_FB.md.
	 * Khong refresh watchdog motor banh xe: day khong phai lenh chuyen dong. */
	if (Protocol_EqualsIgnoreCase(tokens[0], "HEAD") != 0U)
	{
		Protocol_ProcessHead(tokens, token_count);
		return;
	}

	/* TARE,<seq>          -> dat huong hien tai = 0 do
	 * TARE,<seq>,<deg>    -> dat huong hien tai = <deg> do
	 * TARE,<seq>,RAW      -> bo offset, ve lai yaw tho
	 * Khong dung lai watchdog motor: day khong phai lenh chuyen dong. */
	if (Protocol_EqualsIgnoreCase(tokens[0], "TARE") != 0U)
	{
		uint32_t seq;
		float yaw_deg = 0.0f;
		uint8_t clear = 0U;

		if ((token_count < 2U) || (token_count > 3U) ||
			(Protocol_ParseU32(tokens[1], &seq) == 0U))
		{
			Protocol_ReportBadCommand();
			return;
		}

		if (token_count == 3U)
		{
			if (Protocol_EqualsIgnoreCase(tokens[2], "RAW") != 0U)
			{
				clear = 1U;
			}
			else if (Protocol_ParseFloat(tokens[2], &yaw_deg) == 0U)
			{
				Protocol_ReportBadCommand();
				return;
			}
		}

		last_seq = seq;
		if (clear != 0U) BNO08x_ClearYawOffset();
		else             BNO08x_SetYawDeg(yaw_deg);
		return;
	}

	/* DIAG,<seq> -> chan doan IMU tai cho, tra ve mot dong DIAG,...
	 * Blocking ~1.1s (co reset chip) nen dung motor truoc.
	 *   DIAG,<seq>,<ACK|NOACK>,<SELFTEST_OK|SELFTEST_FAIL>,<sw>,<RV_OK|RV_NONE>,
	 *        SDA=<0|1>,SCL=<0|1>,SCAN=<danh sach dia chi ACK> */
	if (Protocol_EqualsIgnoreCase(tokens[0], "DIAG") != 0U)
	{
		uint32_t seq;
		uint8_t maj = 0U;
		uint8_t min = 0U;
		uint8_t ack;
		uint8_t selftest;
		uint8_t rv = 0U;
		uint32_t t0;
		uint8_t sda_high = 0U;
		uint8_t scl_high = 0U;
		uint8_t sda_ext = 0U;
		uint8_t scl_ext = 0U;
		uint16_t pkt_len;
		uint8_t pkt_ch = 0xFFU;
		uint32_t clk_hz;
		uint8_t scan[8];
		uint8_t scan_count;
		char scan_text[32];

		if ((token_count != 2U) || (Protocol_ParseU32(tokens[1], &seq) == 0U))
		{
			Protocol_ReportBadCommand();
			return;
		}

		Motor_StopAll();
		HeadCore_Halt();   /* DIAG chan main loop ~2 s: deadman JOG khong chay duoc */
		protocol_status = PROTOCOL_STATUS_STOP;
		last_seq = seq;

		/* Do truoc tien, khi chua ping/reset gi ca: 1.2s chi doc IMU, de
		 * RATE phan anh dung trang thai chay binh thuong. */
		pkt_len = BNO08x_PeekPacketLen(&pkt_ch);
		t0 = HAL_GetTick();
		while ((uint32_t)(HAL_GetTick() - t0) < 1200U)
		{
			if (BNO08x_ReadRotationVector(NULL, NULL, NULL, NULL, NULL) != 0U) rv = 1U;
		}

		clk_hz = BNO08x_BusClockHz();
		BNO08x_BusIdle(&sda_high, &scl_high);
		BNO08x_BusPullTest(&sda_ext, &scl_ext);

		scan_count = BNO08x_ScanBus(scan, (uint8_t)(sizeof(scan)));
		scan_text[0] = '\0';
		if (scan_count == 0U)
		{
			(void)snprintf(scan_text, sizeof(scan_text), "none");
		}
		else
		{
			int pos = 0;
			uint8_t shown = (scan_count < (uint8_t)sizeof(scan))
			                ? scan_count : (uint8_t)sizeof(scan);
			for (uint8_t i = 0U; i < shown; i++)
			{
				int w = snprintf(&scan_text[pos], sizeof(scan_text) - (size_t)pos,
				                 (i == 0U) ? "%02X" : " %02X", (unsigned)scan[i]);
				if ((w <= 0) || ((size_t)(pos + w) >= sizeof(scan_text))) break;
				pos += w;
			}
		}

		ack = (uint8_t)(BNO08x_Diag() == 0U);
		selftest = BNO08x_SelfTest(&maj, &min);

		/* Self-test co reset chip -> phai bat lai rotation vector. */
		(void)BNO08x_EnableRotationVector(BNO08X_RV_INTERVAL_MS);

		for (uint32_t retry = 0U; retry < 100U; retry++)
		{
			if (Protocol_TrySendFormatted(
					"DIAG,%lu,%s,%s,%u.%u,%s,SDA=%u,SCL=%u,EXTPU=%u%u,SCAN=%s,PKT=%u/ch%u,RATE=%lu,CLK=%lu,SYS=%luMHz,ACC=%u,WARN=%lu,REC=%lu,DWT=%u,REARM=%lu,RST=%lu\r\n",
					(unsigned long)seq,
					(ack != 0U) ? "ACK" : "NOACK",
					(selftest != 0U) ? "SELFTEST_OK" : "SELFTEST_FAIL",
					(unsigned)maj, (unsigned)min,
					(rv != 0U) ? "RV_OK" : "RV_NONE",
					(unsigned)sda_high, (unsigned)scl_high,
					(unsigned)sda_ext, (unsigned)scl_ext,
					scan_text, (unsigned)pkt_len, (unsigned)pkt_ch,
					(unsigned long)BNO08x_GetSampleRate(),
					(unsigned long)clk_hz,
					(unsigned long)(SystemCoreClock / 1000000U),
					(unsigned)BNO08x_GetAccuracy(),
					(unsigned long)BNO08x_GetBusWarnCount(),
					(unsigned long)BNO08x_GetBusRecoverCount(),
					(unsigned)BNO08x_IsDwtOk(),
					(unsigned long)BNO08x_GetRearmCount(),
					(unsigned long)BNO08x_GetResetSeenCount()) != 0U)
			{
				break;
			}
			HAL_Delay(2);
		}
		return;
	}

	Protocol_ReportBadCommand();
}

static void Protocol_ProcessHead(char *tokens[], uint8_t token_count)
{
	uint32_t seq;
	HeadResult result;

	if ((token_count < 3U) || (token_count > 5U) ||
		(Protocol_ParseU32(tokens[1], &seq) == 0U))
	{
		Protocol_ReportBadCommand();
		return;
	}

	if (token_count == 5U)
	{
		int32_t a;
		int32_t b;
		uint8_t is_step = Protocol_EqualsIgnoreCase(tokens[2], "STEP");
		uint8_t is_jog = Protocol_EqualsIgnoreCase(tokens[2], "JOG");

		if (((is_step == 0U) && (is_jog == 0U)) ||
			(Protocol_ParseI32(tokens[3], &a) == 0U) ||
			(Protocol_ParseI32(tokens[4], &b) == 0U) ||
			((is_jog != 0U) && ((a < -1) || (a > 1) || (b < -1) || (b > 1))))
		{
			Protocol_ReportBadCommand();
			return;
		}
		result = (is_step != 0U) ? HeadCore_Step(a, b)
		                         : HeadCore_Jog((int8_t)a, (int8_t)b, HAL_GetTick());
	}
	else if (token_count == 3U)
	{
		if (Protocol_EqualsIgnoreCase(tokens[2], "HOME") != 0U)
		{
			result = HeadCore_Home();
		}
		else if (Protocol_EqualsIgnoreCase(tokens[2], "ZERO") != 0U)
		{
			result = HeadCore_Zero();
		}
		else if (Protocol_EqualsIgnoreCase(tokens[2], "OFF") != 0U)
		{
			HeadCore_Off();
			result = HEAD_OK;
		}
		else if (Protocol_EqualsIgnoreCase(tokens[2], "STOP") != 0U)
		{
			HeadCore_Halt();   /* giam toc ve 0, giu driver; dang HOME thi huy HOME */
			result = HEAD_OK;
		}
		else
		{
			Protocol_ReportBadCommand();
			return;
		}
	}
	else
	{
		int32_t pan_cdeg;
		int32_t tilt_cdeg;

		if ((Protocol_ParseI32(tokens[2], &pan_cdeg) == 0U) ||
			(Protocol_ParseI32(tokens[3], &tilt_cdeg) == 0U))
		{
			Protocol_ReportBadCommand();
			return;
		}
		result = HeadCore_Command(pan_cdeg, tilt_cdeg);
	}

	last_seq = seq;
	switch (result)
	{
	case HEAD_OK:
		last_head_seq = seq;
		break;
	/* Tu choi lenh dau quay KHONG doi <status> cua FB: truong do mo ta banh
	 * xe (OK/STOP/TIMEOUT/ERR), banh xe van chay binh thuong. */
	case HEAD_ERR_NOT_ZEROED:
		Protocol_QueueError(ERR_HEAD_NOT_ZERO);
		break;
	case HEAD_ERR_LIMIT:
		Protocol_QueueError(ERR_HEAD_LIMIT);
		break;
	case HEAD_ERR_BUSY:
	default:
		Protocol_QueueError(ERR_HEAD_BUSY);
		break;
	}
}

void Protocol_SendFeedback(void)
{
	uint32_t now = HAL_GetTick();

	if (Protocol_TrySendFeedback(now) != 0U)
	{
		last_feedback_sent_ms = now;
		last_feedback_attempt_ms = now;
	}
}

uint32_t Protocol_GetLastSeq(void)
{
	return last_seq;
}

/* Rut HET cac dong dang cho trong mot lan goi.
 *
 * Hai diem quan trong (day la cho tung gay ERR,bad_command lien tuc):
 *  1. Co bad_ready duoc doc/xoa RIENG, khong dung else-if voi viec pop queue.
 *     Mot dong hong khong duoc chan cac dong hop le phia sau.
 *  2. Drain toi da USB_RX_QUEUE_COUNT dong / lan goi. App_Loop chay ~200 ms
 *     (SR04T + BNO08x), neu chi xu ly 1 dong/vong thi host >= 10 Hz se lam
 *     queue day vinh vien. Chan tren = kich thuoc queue nen thoi gian
 *     App_Loop van co bien.
 *
 * Critical section chi bao mot lan pop (copy <= USB_RX_LINE_SIZE byte).
 * Protocol_ProcessLine() chay NGOAI critical section: no co the goi
 * Motor_*, CDC_Transmit_FS, va DIAG con block ~1.2 s. */
static void Protocol_CheckRxLine(void)
{
	char line[USB_RX_LINE_SIZE];
	uint8_t has_bad_line;

	__disable_irq();
	has_bad_line = usb_rx_queue_take_bad(&rx_queue);
	__enable_irq();

	if (has_bad_line != 0U)
	{
		Protocol_ReportBadCommand();
	}

	for (uint8_t i = 0U; i < USB_RX_QUEUE_COUNT; i++)
	{
		uint8_t has_line;

		__disable_irq();
		has_line = usb_rx_queue_pop(&rx_queue, line);
		__enable_irq();

		if (has_line == 0U)
		{
			break;
		}

		Protocol_ProcessLine(line);
	}
}

static void Protocol_CheckTimeout(uint32_t now_ms)
{
	if ((uint32_t)(now_ms - last_valid_rx_ms) <= CMD_TIMEOUT_MS)
	{
		return;
	}

	if (protocol_status != PROTOCOL_STATUS_TIMEOUT)
	{
		Motor_StopAll();
		protocol_status = PROTOCOL_STATUS_TIMEOUT;
	}
}

static void Protocol_CheckFeedback(uint32_t now_ms)
{
	if ((uint32_t)(now_ms - last_feedback_sent_ms) < FEEDBACK_PERIOD_MS)
	{
		return;
	}

	if ((uint32_t)(now_ms - last_feedback_attempt_ms) < FEEDBACK_PERIOD_MS)
	{
		return;
	}

	last_feedback_attempt_ms = now_ms;
	if (Protocol_TrySendFeedback(now_ms) != 0U)
	{
		last_feedback_sent_ms = now_ms;
	}
}

static void Protocol_ReportBadCommand(void)
{
	protocol_status = PROTOCOL_STATUS_ERR;
	Protocol_QueueError(ERR_BAD_COMMAND);
}

static void Protocol_QueueError(const char *line)
{
	pending_error = line;
}

static uint8_t Protocol_TrySendPendingError(void)
{
	uint32_t now;

	if (pending_error == NULL)
	{
		return 0U;
	}

	now = HAL_GetTick();
	if ((uint32_t)(now - last_error_attempt_ms) < FEEDBACK_PERIOD_MS)
	{
		return 0U;
	}

	last_error_attempt_ms = now;
	if (Protocol_TrySendRaw(pending_error) != 0U)
	{
		pending_error = NULL;
		return 1U;
	}

	return 0U;
}

static uint8_t Protocol_TrySendFeedback(uint32_t now_ms)
{
	uint32_t dt_ms = now_ms - last_feedback_sent_ms;
	uint16_t sonar1_mm = 0U;
	uint16_t sonar2_mm = 0U;
	uint16_t sonar3_mm = 0U;
	uint16_t sonar4_mm = 0U;
	uint8_t sonar1_valid = 0U;
	uint8_t sonar2_valid = 0U;
	uint8_t sonar3_valid = 0U;
	uint8_t sonar4_valid = 0U;
	HeadStatus head;

	/* CONTRACT: robot/docs/PROTOCOL_FB.md la nguon su that duy nhat cua khung
	 * nay. Chi duoc THEM truong o CUOI, va phai cap nhat doc + test o ca hai
	 * dau trong cung mot lan thay doi.
	 *
	 * Yaw tu IMU (cache). Gui dang centi-do (yaw*100) kieu integer de tranh
	 * phu thuoc %f. yaw_valid=1 neu IMU da co du lieu.
	 * Format moi (tuong thich nguoc, them yaw va 4 SR04T):
	 *   FB,<seq>,<left>,<right>,<dt_ms>,<status>,<yaw_cdeg>,<yaw_valid>,
	 *      <sonar1_mm>,<sonar1_valid>,<sonar2_mm>,<sonar2_valid>,
	 *      <sonar3_mm>,<sonar3_valid>,<sonar4_mm>,<sonar4_valid>,<yaw_acc>,
 *      <imu_rearm>,<imu_reset_seen>,
	 *      <head_seq>,<pan_cdeg>,<tilt_cdeg>,<head_state>,<contactor>
	 * yaw_acc 0..3: 0 = tu ke chua hieu chuan, heading co the sai hang chuc do.
	 * imu_rearm / imu_reset_seen: bo dem tich luy tu luc boot (BNO08x_Service).
	 * head_*: seq lenh HEAD cuoi duoc chap nhan, vi tri dem xung (centi-do),
	 * trang thai 0=OFF 1=IDLE 2=MOVING 3=HOMING 4=NO_REF (head/head_core.h).
	 * contactor: 1 = firmware dang xuat PA10 muc cao (lenh ON), khong phai
	 * phan hoi tu tiep diem contactor. */
	uint8_t yaw_valid = 0U;
	float   yaw_deg   = BNO08x_GetLastYaw(&yaw_valid);
	long    yaw_cdeg  = (long)(yaw_deg * 100.0f);
	SR04T_GetReading(0U, &sonar1_mm, &sonar1_valid);
	SR04T_GetReading(1U, &sonar2_mm, &sonar2_valid);
	SR04T_GetReading(2U, &sonar3_mm, &sonar3_valid);
	SR04T_GetReading(3U, &sonar4_mm, &sonar4_valid);
	HeadCore_GetStatus(&head);

	return Protocol_TrySendFormatted(
		"FB,%lu,%ld,%ld,%lu,%s,%ld,%u,%u,%u,%u,%u,%u,%u,%u,%u,%u,%lu,%lu,%lu,%ld,%ld,%u,%u\r\n",
		(unsigned long)last_seq,
		(long)Motor_GetLeftCount(),
		(long)Motor_GetRightCount(),
		(unsigned long)dt_ms,
		Protocol_StatusText(),
		yaw_cdeg,
		(unsigned)yaw_valid,
		(unsigned)sonar1_mm,
		(unsigned)sonar1_valid,
		(unsigned)sonar2_mm,
		(unsigned)sonar2_valid,
		(unsigned)sonar3_mm,
		(unsigned)sonar3_valid,
		(unsigned)sonar4_mm,
		(unsigned)sonar4_valid,
		(unsigned)BNO08x_GetAccuracy(),
		(unsigned long)BNO08x_GetRearmCount(),
		(unsigned long)BNO08x_GetResetSeenCount(),
		(unsigned long)last_head_seq,
		(long)head.pan_cdeg,
		(long)head.tilt_cdeg,
		(unsigned)head.state,
		(unsigned)Contactor_IsCommandedOn());
}

static uint8_t Protocol_TrySendRaw(const char *text)
{
	return (uint8_t)(CDC_Transmit_FS((uint8_t*)text, (uint16_t)strlen(text)) == USBD_OK);
}

static uint8_t Protocol_TrySendFormatted(const char *format, ...)
{
	char *buffer = tx_buffers[tx_write_index];
	va_list args;
	int length;
	uint8_t status;

	va_start(args, format);
	length = vsnprintf(buffer, PROTOCOL_TX_BUFFER_SIZE, format, args);
	va_end(args);

	if (length <= 0)
	{
		return 0U;
	}

	if (length >= (int)PROTOCOL_TX_BUFFER_SIZE)
	{
		length = (int)PROTOCOL_TX_BUFFER_SIZE - 1;
	}

	status = CDC_Transmit_FS((uint8_t*)buffer, (uint16_t)length);
	if (status == USBD_OK)
	{
		tx_write_index ^= 1U;
		return 1U;
	}

	return 0U;
}

static uint8_t Protocol_TokenizeCsv(char *line, char *tokens[], uint8_t max_tokens, uint8_t *token_count)
{
	char *start = line;
	uint8_t count = 0U;

	while (1)
	{
		char *end = start;
		while ((*end != '\0') && (*end != ','))
		{
			end++;
		}

		if (count >= max_tokens)
		{
			return 0U;
		}

		if (*end == ',')
		{
			*end = '\0';
			tokens[count] = Protocol_Trim(start);
			count++;
			start = end + 1;
		}
		else
		{
			tokens[count] = Protocol_Trim(start);
			count++;
			break;
		}
	}

	*token_count = count;
	return 1U;
}

static char *Protocol_Trim(char *text)
{
	char *end;

	while ((*text != '\0') && (isspace((unsigned char)*text) != 0))
	{
		text++;
	}

	end = text + strlen(text);
	while ((end > text) && (isspace((unsigned char)*(end - 1)) != 0))
	{
		end--;
	}
	*end = '\0';

	return text;
}

static uint8_t Protocol_EqualsIgnoreCase(const char *left, const char *right)
{
	while ((*left != '\0') && (*right != '\0'))
	{
		if (tolower((unsigned char)*left) != tolower((unsigned char)*right))
		{
			return 0U;
		}

		left++;
		right++;
	}

	return (uint8_t)((*left == '\0') && (*right == '\0'));
}

static uint8_t Protocol_ParseU32(const char *text, uint32_t *value)
{
	char *end;
	unsigned long parsed;

	if ((text == NULL) || (*text == '\0') || (*text == '-'))
	{
		return 0U;
	}

	parsed = strtoul(text, &end, 10);
	if ((end == text) || (*end != '\0'))
	{
		return 0U;
	}

	*value = (uint32_t)parsed;
	return 1U;
}

static uint8_t Protocol_ParseI32(const char *text, int32_t *value)
{
	char *end;
	long parsed;

	if ((text == NULL) || (*text == '\0'))
	{
		return 0U;
	}

	parsed = strtol(text, &end, 10);
	if ((end == text) || (*end != '\0') || (parsed > 1000000L) || (parsed < -1000000L))
	{
		return 0U;
	}

	*value = (int32_t)parsed;
	return 1U;
}

static uint8_t Protocol_ParseFloat(const char *text, float *value)
{
	char *end;
	float parsed;

	if ((text == NULL) || (*text == '\0'))
	{
		return 0U;
	}

	parsed = strtof(text, &end);
	if ((end == text) || (*end != '\0') || (parsed != parsed) || (parsed > 1000000.0f) || (parsed < -1000000.0f))
	{
		return 0U;
	}

	*value = parsed;
	return 1U;
}

static const char *Protocol_StatusText(void)
{
	switch (protocol_status)
	{
	case PROTOCOL_STATUS_OK:
		return "OK";
	case PROTOCOL_STATUS_STOP:
		return "STOP";
	case PROTOCOL_STATUS_TIMEOUT:
		return "TIMEOUT";
	case PROTOCOL_STATUS_ERR:
	default:
		return "ERR";
	}
}
