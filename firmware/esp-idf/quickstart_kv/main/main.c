/*
 * WebSerial Dash quick start, ESP-IDF version. Prints one line per sample:
 *
 *     ticks=12345 temp=21.5 hum=40 heap=273512
 *
 * Every name becomes a signal on the "quickstart" dashboard automatically.
 * `ticks` is milliseconds since boot (esp_timer); the dashboard uses it to time
 * samples precisely, or just records it if source.timestamp.use is false.
 */
#include <math.h>
#include <stdio.h>
#include "esp_system.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

void app_main(void)
{
    printf("quickstart_kv booted\n");  /* ignored by the kv parser, visible in the terminal */
    TickType_t last = xTaskGetTickCount();
    for (;;) {
        int64_t ms = esp_timer_get_time() / 1000;
        double temp = 25.0 + 5.0 * sin(ms / 20000.0 * 2 * M_PI);
        int hum = 45 + (int)(10 * sin(ms / 15000.0 * 2 * M_PI));
        printf("ticks=%lld temp=%.1f hum=%d heap=%lu\n", (long long)ms, temp, hum,
               (unsigned long)esp_get_free_heap_size());
        vTaskDelayUntil(&last, pdMS_TO_TICKS(100));  /* 10 Hz */
    }
}
