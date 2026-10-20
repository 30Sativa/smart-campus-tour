#include "imu/bno08x_rearm.h"

#include <stddef.h>

void bno08x_rearm_note_request(bno08x_rearm_t *w, uint32_t now_ms)
{
    if (w != NULL) w->last_request_ms = now_ms;
}

uint8_t bno08x_rearm_due(bno08x_rearm_t *w, uint32_t now_ms,
                         uint8_t have_sample, uint32_t last_sample_ms)
{
    if (w == NULL) return 0U;

    /* Chip can thoi gian de tra mau sau mot Set Feature; gui doc dap chi ton
     * bus. */
    if ((uint32_t)(now_ms - w->last_request_ms) < BNO08X_REARM_MIN_INTERVAL_MS) return 0U;

    uint8_t stale = (have_sample == 0U) ||
                    ((uint32_t)(now_ms - last_sample_ms) >= BNO08X_REARM_STALE_MS);
    if (stale == 0U) return 0U;

    w->last_request_ms = now_ms;
    return 1U;
}
