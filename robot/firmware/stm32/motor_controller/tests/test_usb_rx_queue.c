/**
 * Test host (gcc) cho hang doi dong RX cua USB CDC.
 * Chay: ./scripts/verify.sh
 *
 * Bug goc duoc chan o day: Protocol_CheckRxLine() cu dung
 *     if (bad_ready) {...} else if (count > 0) { pop 1 dong }
 * nen (a) mot dong hong chan viec rut cac dong hop le, va (b) moi vong
 * App_Loop (~200 ms) chi xu ly 1 dong -> host >= 10 Hz lam queue day
 * vinh vien -> ERR,bad_command lien tuc.
 */
#include "usb_rx_queue.h"

#include <stdio.h>
#include <string.h>

static int g_fail = 0;

#define CHECK(cond, msg)                                                       \
    do {                                                                       \
        if (cond) { printf("  ok   %s\n", (msg)); }                            \
        else      { printf("  FAIL %s   (%s:%d)\n", (msg), __FILE__, __LINE__); g_fail++; } \
    } while (0)

/* Mo phong dung logic Protocol_CheckRxLine() sau khi sua:
 * doc/xoa co bad RIENG, roi drain toi da USB_RX_QUEUE_COUNT dong.
 * Tra ve so dong hop le da xu ly; *bad = co bao ERR hay khong. */
static int drain_once(UsbRxQueue *q, char out[][USB_RX_LINE_SIZE], int *bad)
{
    char line[USB_RX_LINE_SIZE];
    int n = 0;

    *bad = (int)usb_rx_queue_take_bad(q);

    for (unsigned i = 0U; i < USB_RX_QUEUE_COUNT; i++)
    {
        if (usb_rx_queue_pop(q, line) == 0U) break;
        memcpy(out[n], line, USB_RX_LINE_SIZE);
        n++;
    }
    return n;
}

static void push_seq(UsbRxQueue *q, int first, int count)
{
    for (int i = 0; i < count; i++)
    {
        char line[USB_RX_LINE_SIZE];
        snprintf(line, sizeof(line), "STOP,%d", first + i);
        (void)usb_rx_queue_push(q, line);
    }
}

static void test_fifo_order(void)
{
    printf("test_fifo_order\n");
    UsbRxQueue q;
    usb_rx_queue_reset(&q);

    push_seq(&q, 1000, 3);
    CHECK(q.count == 3U, "3 dong trong queue");

    char out[USB_RX_QUEUE_COUNT][USB_RX_LINE_SIZE];
    int bad = 0;
    int n = drain_once(&q, out, &bad);

    CHECK(n == 3, "drain lay ca 3 dong trong MOT lan goi");
    CHECK(bad == 0, "khong co co bad");
    CHECK(strcmp(out[0], "STOP,1000") == 0, "dong 0 dung thu tu");
    CHECK(strcmp(out[1], "STOP,1001") == 0, "dong 1 dung thu tu");
    CHECK(strcmp(out[2], "STOP,1002") == 0, "dong 2 dung thu tu");
    CHECK(q.count == 0U, "queue rong sau khi drain");
}

static void test_bad_flag_khong_nuot_lenh_hop_le(void)
{
    printf("test_bad_flag_khong_nuot_lenh_hop_le\n");
    UsbRxQueue q;
    usb_rx_queue_reset(&q);

    push_seq(&q, 2000, 2);
    usb_rx_queue_mark_bad(&q);   /* vd: dong qua dai -> overflow ky tu */

    char out[USB_RX_QUEUE_COUNT][USB_RX_LINE_SIZE];
    int bad = 0;
    int n = drain_once(&q, out, &bad);

    /* Code cu: else-if -> bao bad va KHONG rut dong nao. */
    CHECK(bad == 1, "co bad duoc bao cao");
    CHECK(n == 2, "van rut du 2 lenh hop le trong cung lan goi");
    CHECK(strcmp(out[0], "STOP,2000") == 0, "lenh hop le khong bi mat");
    CHECK(q.bad_ready == 0U, "co bad da duoc xoa");
}

static void test_queue_day_thi_set_bad(void)
{
    printf("test_queue_day_thi_set_bad\n");
    UsbRxQueue q;
    usb_rx_queue_reset(&q);

    for (unsigned i = 0U; i < USB_RX_QUEUE_COUNT; i++)
    {
        char line[USB_RX_LINE_SIZE];
        snprintf(line, sizeof(line), "STOP,%u", 3000U + i);
        CHECK(usb_rx_queue_push(&q, line) == 1U, "push khi con cho -> OK");
    }

    CHECK(usb_rx_queue_push(&q, "STOP,9999") == 0U, "push khi day -> bi tu choi");
    CHECK(q.bad_ready == 1U, "queue day -> set bad_ready");
    CHECK(q.count == USB_RX_QUEUE_COUNT, "khong ghi de dong dang cho");

    char out[USB_RX_QUEUE_COUNT][USB_RX_LINE_SIZE];
    int bad = 0;
    int n = drain_once(&q, out, &bad);
    CHECK(bad == 1, "bao ERR mot lan");
    CHECK(n == (int)USB_RX_QUEUE_COUNT, "drain het queue day trong mot lan goi");
    CHECK(strcmp(out[0], "STOP,3000") == 0, "dong cu nhat ra truoc");
    CHECK(strcmp(out[USB_RX_QUEUE_COUNT - 1U], "STOP,3007") == 0, "dong moi nhat ra sau");
}

/* Kich ban that: host 10-20 Hz, App_Loop ~200 ms -> ~2-4 dong moi vong.
 * Voi drain-all, queue phai luon ve rong va khong bao gio bao bad. */
static void test_khong_don_ung_o_10_20hz(void)
{
    printf("test_khong_don_ung_o_10_20hz\n");
    UsbRxQueue q;
    usb_rx_queue_reset(&q);

    int seq = 4000;
    int bad_total = 0;
    int processed = 0;
    int max_count = 0;

    for (int loop = 0; loop < 50; loop++)
    {
        int per_loop = (loop % 2 == 0) ? 4 : 2;   /* jitter 2-4 dong/vong */
        push_seq(&q, seq, per_loop);
        seq += per_loop;
        if ((int)q.count > max_count) max_count = (int)q.count;

        char out[USB_RX_QUEUE_COUNT][USB_RX_LINE_SIZE];
        int bad = 0;
        processed += drain_once(&q, out, &bad);
        bad_total += bad;
    }

    CHECK(bad_total == 0, "khong co ERR,bad_command nao trong 50 vong");
    CHECK(processed == seq - 4000, "moi lenh gui deu duoc xu ly");
    CHECK(q.count == 0U, "queue rong sau moi vong");
    CHECK(max_count <= 4, "queue khong bao gio don len qua 1 vong");
}

static void test_wrap_vong_tron(void)
{
    printf("test_wrap_vong_tron\n");
    UsbRxQueue q;
    usb_rx_queue_reset(&q);

    char out[USB_RX_QUEUE_COUNT][USB_RX_LINE_SIZE];
    int bad = 0;
    int ok = 1;

    /* Day/rut nhieu lan de head+tail quay vong nhieu vong. */
    for (int round = 0; round < 7; round++)
    {
        push_seq(&q, 5000 + round * 5, 5);
        if (drain_once(&q, out, &bad) != 5) ok = 0;
        for (int i = 0; i < 5; i++)
        {
            char want[USB_RX_LINE_SIZE];
            snprintf(want, sizeof(want), "STOP,%d", 5000 + round * 5 + i);
            if (strcmp(out[i], want) != 0) ok = 0;
        }
    }

    CHECK(ok == 1, "thu tu dung qua nhieu lan wrap head/tail");
    CHECK(bad == 0, "khong bao bad khi chua bao gio day");
}

static void test_dong_qua_dai_bi_cat(void)
{
    printf("test_dong_qua_dai_bi_cat\n");
    UsbRxQueue q;
    usb_rx_queue_reset(&q);

    char big[USB_RX_LINE_SIZE * 2];
    memset(big, 'A', sizeof(big) - 1U);
    big[sizeof(big) - 1U] = '\0';

    CHECK(usb_rx_queue_push(&q, big) == 1U, "push dong qua dai van thanh cong");

    char line[USB_RX_LINE_SIZE];
    CHECK(usb_rx_queue_pop(&q, line) == 1U, "pop duoc");
    CHECK(strlen(line) == USB_RX_LINE_SIZE - 1U, "bi cat vua buffer, con NUL terminator");
}

int main(void)
{
    test_fifo_order();
    test_bad_flag_khong_nuot_lenh_hop_le();
    test_queue_day_thi_set_bad();
    test_khong_don_ung_o_10_20hz();
    test_wrap_vong_tron();
    test_dong_qua_dai_bi_cat();

    if (g_fail != 0)
    {
        printf("\n%d TEST FAIL\n", g_fail);
        return 1;
    }

    printf("\nTAT CA TEST PASS\n");
    return 0;
}
