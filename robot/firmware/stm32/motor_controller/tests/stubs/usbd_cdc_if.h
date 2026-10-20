/* Host-only stand-in for USB_Device/App/usbd_cdc_if.h (tests only). */
#ifndef TEST_STUB_USBD_CDC_IF_H
#define TEST_STUB_USBD_CDC_IF_H
#include <stdint.h>
#define USBD_OK   0U
#define USBD_BUSY 1U
uint8_t CDC_Transmit_FS(uint8_t *Buf, uint16_t Len);
#endif
