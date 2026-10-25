/*
 * main.c — ESP-IDF companion firmware for the "demo-sensor" dashboard.
 *
 * Prints one CSV line every 100 ms (10 Hz) on the default console UART:
 *
 *     temp,hum,vbat,fan
 *     23.5,41,3.70,0
 *
 * and accepts newline-terminated commands:
 *
 *     fan 1     -> "ok fan=1"
 *     fan 0     -> "ok fan=0"
 *     status    -> "status fan=0 uptime=12s"
 *
 * Replies go on their own lines; the dashboard's CSV parser skips any line that is
 * not all-numeric, so they appear in the terminal without disturbing the plots.
 * Avoid reply lines starting with '#', which the parser treats as a column header.
 *
 * The console UART baud rate is CONFIG_ESP_CONSOLE_UART_BAUDRATE, 115200 by default
 * (menuconfig -> Component config -> ESP System Settings -> Channel for console
 * output). The dashboard expects 115200.
 *
 * Output uses printf() through the standard console; input uses the UART driver on
 * UART_NUM_0 so we can poll for commands without blocking the sample loop.
 */

#include <math.h>
#include <stdio.h>
#include <string.h>

#include "driver/uart.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "sdkconfig.h"

#define CONSOLE_UART UART_NUM_0
#define SAMPLE_PERIOD_MS 100  /* 10 Hz */
#define CMD_BUF_LEN 32

static bool s_fan_on = false;

/* ---- simulated signals ---------------------------------------------------
 * Periods and ranges mirror dashboards/demo-sensor.json's "simulate" section. */

static float phase(int64_t now_ms, int64_t period_ms) {
    return (float)(now_ms % period_ms) / (float)period_ms;
}

static float sine(int64_t now_ms, float lo, float hi, int64_t period_ms) {
    float s = (sinf(phase(now_ms, period_ms) * 2.0f * (float)M_PI) + 1.0f) * 0.5f;
    return lo + s * (hi - lo);
}

static float triangle(int64_t now_ms, float lo, float hi, int64_t period_ms) {
    float p = phase(now_ms, period_ms);
    float tri = p < 0.5f ? p * 2.0f : (1.0f - p) * 2.0f;
    return lo + tri * (hi - lo);
}

static float sawtooth(int64_t now_ms, float lo, float hi, int64_t period_ms) {
    return lo + phase(now_ms, period_ms) * (hi - lo);
}

/* ---- sensor readout ------------------------------------------------------ */

typedef struct {
    float temp; /* °C */
    int hum;    /* %RH */
    float vbat; /* V */
} reading_t;

static reading_t read_sensors(int64_t now_ms) {
    reading_t r;

    /* Simulated values. Replace with real drivers, e.g. an I2C SHT3x for
     * temp/hum and adc_oneshot_read() through a divider for vbat. */
    r.temp = sine(now_ms, 18.0f, 92.0f, 20000);
    r.hum = (int)lroundf(triangle(now_ms, 30.0f, 70.0f, 15000));
    r.vbat = sawtooth(now_ms, 3.3f, 4.2f, 60000);

    if (s_fan_on) r.temp -= 2.0f; /* a running fan cools things a little */
    return r;
}

/* ---- command handling ---------------------------------------------------- */

static void handle_command(char *line) {
    /* Trim surrounding whitespace in place. */
    while (*line == ' ' || *line == '\t') line++;
    size_t n = strlen(line);
    while (n > 0 && (line[n - 1] == ' ' || line[n - 1] == '\t' || line[n - 1] == '\r')) line[--n] = '\0';
    if (n == 0) return;

    if (strcmp(line, "fan 1") == 0) {
        s_fan_on = true;
        /* gpio_set_level(FAN_GPIO, 1); */
        printf("ok fan=1\n");
    } else if (strcmp(line, "fan 0") == 0) {
        s_fan_on = false;
        /* gpio_set_level(FAN_GPIO, 0); */
        printf("ok fan=0\n");
    } else if (strcmp(line, "status") == 0) {
        printf("status fan=%d uptime=%llds\n", s_fan_on ? 1 : 0, (long long)(esp_timer_get_time() / 1000000));
    } else {
        printf("err unknown command: %s\n", line);
    }
    fflush(stdout);
}

/* Non-blocking read of pending bytes; dispatches complete lines. */
static void poll_commands(void) {
    static char buf[CMD_BUF_LEN];
    static size_t len = 0;
    uint8_t c;

    while (uart_read_bytes(CONSOLE_UART, &c, 1, 0) == 1) {
        if (c == '\n' || c == '\r') {
            buf[len] = '\0';
            handle_command(buf);
            len = 0;
        } else if (len < sizeof(buf) - 1) {
            buf[len++] = (char)c;
        } else {
            len = 0; /* overflow: drop the line */
        }
    }
}

/* ---- entry point --------------------------------------------------------- */

void app_main(void) {
    /* Install the UART driver for RX only; TX keeps going through printf/stdout.
     * The console baud rate was already configured by the bootloader/console init. */
    ESP_ERROR_CHECK(uart_driver_install(CONSOLE_UART, 256, 0, 0, NULL, 0));

    printf("temp,hum,vbat,fan\n"); /* optional header, makes raw captures self-describing */
    fflush(stdout);

    TickType_t last_wake = xTaskGetTickCount();
    for (;;) {
        poll_commands();

        int64_t now_ms = esp_timer_get_time() / 1000;
        reading_t r = read_sensors(now_ms);
        printf("%.1f,%d,%.2f,%d\n", r.temp, r.hum, r.vbat, s_fan_on ? 1 : 0);
        fflush(stdout);

        vTaskDelayUntil(&last_wake, pdMS_TO_TICKS(SAMPLE_PERIOD_MS));
    }
}
