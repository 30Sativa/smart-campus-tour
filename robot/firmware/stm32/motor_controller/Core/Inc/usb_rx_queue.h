/**
 ******************************************************************************
 * @file    usb_rx_queue.h
 * @brief   Hang doi dong lenh RX cua USB CDC (logic thuan, khong phu thuoc HAL).
 *
 * ISR (CDC_Receive_FS -> Protocol_ProcessRxByte) day dong vao queue;
 * main loop (Protocol_CheckRxLine) rut dong ra. Moi thao tac o day PHAI
 * duoc goi trong critical section ngan (__disable_irq/__enable_irq) o phia
 * main loop; phia ISR da chay o muc uu tien cao nen khong can khoa them.
 *
 * Co bao loi (bad_ready) TACH ROI khoi queue: doc/xoa co khong duoc lam
 * anh huong den viec rut cac dong hop le con lai (chinh la bug lam
 * firmware spam ERR,bad_command khi host gui >= 10 Hz).
 *
 * Tach header-only de compile & test duoc tren host bang gcc
 * (xem tests/test_usb_rx_queue.c), cung kieu voi imu/bno08x_parse.h.
 ******************************************************************************
 */
#ifndef USB_RX_QUEUE_H
#define USB_RX_QUEUE_H

#include <stdint.h>
#include <string.h>

#ifndef USB_RX_LINE_SIZE
#define USB_RX_LINE_SIZE 96U
#endif

#ifndef USB_RX_QUEUE_COUNT
#define USB_RX_QUEUE_COUNT 8U
#endif

typedef struct
{
	/* Khong volatile: chi truy cap trong critical section (main loop) hoac
	 * trong ISR; head/tail/count moi la bien dong bo giua hai ben. */
	char lines[USB_RX_QUEUE_COUNT][USB_RX_LINE_SIZE];
	volatile uint8_t head;
	volatile uint8_t tail;
	volatile uint8_t count;
	volatile uint8_t bad_ready;
} UsbRxQueue;

static inline void usb_rx_queue_reset(UsbRxQueue *q)
{
	q->head = 0U;
	q->tail = 0U;
	q->count = 0U;
	q->bad_ready = 0U;
}

/** Danh dau "co dong hong" (overflow ky tu, hoac queue day). */
static inline void usb_rx_queue_mark_bad(UsbRxQueue *q)
{
	q->bad_ready = 1U;
}

/**
 * Doc va xoa co bad_ready. Doc lap hoan toan voi queue: goi ham nay
 * KHONG lam mat mot dong hop le nao.
 * @return 1 neu co dong hong dang cho bao cao.
 */
static inline uint8_t usb_rx_queue_take_bad(UsbRxQueue *q)
{
	uint8_t bad = q->bad_ready;
	q->bad_ready = 0U;
	return bad;
}

/**
 * Day mot dong (chuoi da NUL-terminated) vao queue. Goi tu ISR.
 * Queue day -> dong bi bo va bad_ready duoc set (host se thay ERR,bad_command).
 * @return 1 neu day thanh cong.
 */
static inline uint8_t usb_rx_queue_push(UsbRxQueue *q, const char *line)
{
	size_t len;

	if (q->count >= USB_RX_QUEUE_COUNT)
	{
		q->bad_ready = 1U;
		return 0U;
	}

	len = strlen(line);
	if (len >= USB_RX_LINE_SIZE)
	{
		len = USB_RX_LINE_SIZE - 1U;
	}

	memcpy(q->lines[q->head], line, len);
	q->lines[q->head][len] = '\0';
	q->head = (uint8_t)((q->head + 1U) % USB_RX_QUEUE_COUNT);
	q->count++;
	return 1U;
}

/**
 * Rut dong cu nhat ra @p out (buffer >= USB_RX_LINE_SIZE byte).
 * Chi copy du lieu, khong xu ly gi -> giu critical section that ngan.
 * @return 1 neu co dong, 0 neu queue rong.
 */
static inline uint8_t usb_rx_queue_pop(UsbRxQueue *q, char *out)
{
	if (q->count == 0U)
	{
		return 0U;
	}

	memcpy(out, q->lines[q->tail], USB_RX_LINE_SIZE);
	q->tail = (uint8_t)((q->tail + 1U) % USB_RX_QUEUE_COUNT);
	q->count--;
	return 1U;
}

#endif /* USB_RX_QUEUE_H */
