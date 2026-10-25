/*
 * WebSerial Dash: Wi-Fi RSSI + internet speed test, for dashboards/wifi-speedtest.json.
 *
 * Output (kv lines, 115200 baud):
 *   every 500 ms               ticks=<ms since boot> rssi=<dBm>      (-100 when not connected)
 *   after "speedtest"          speedtest: running
 *                              down_mbps=<f> up_mbps=<f> ping_ms=<n>
 *   status / errors            lines without '=' (ignored by the parser, shown in the terminal)
 *
 * Commands (type them in the dashboard terminal, one per line):
 *   wifi <ssid> <password>     save credentials in flash and connect (password = last word)
 *   speedtest                  run a download/upload/latency test against speed.cloudflare.com
 *   status                     print connection state
 */
#include <stdio.h>
#include <string.h>
#include "driver/uart.h"
#include "esp_crt_bundle.h"
#include "esp_event.h"
#include "esp_http_client.h"
#include "esp_netif.h"
#include "esp_timer.h"
#include "esp_wifi.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "nvs_flash.h"

#define CONSOLE_UART UART_NUM_0
#define DOWN_URL "https://speed.cloudflare.com/__down?bytes=2000000"
#define PING_URL "https://speed.cloudflare.com/__down?bytes=0"
#define UP_URL "https://speed.cloudflare.com/__up"
#define UP_BYTES (256 * 1024)
#define CHUNK 4096

static volatile bool s_connected = false;
static volatile bool s_test_running = false;
static bool s_have_credentials = false;

static int64_t now_ms(void) { return esp_timer_get_time() / 1000; }

/* ---------------------------------------------------------------- Wi-Fi */

static void on_wifi_event(void *arg, esp_event_base_t base, int32_t id, void *data)
{
    if (base == WIFI_EVENT && id == WIFI_EVENT_STA_START) {
        if (s_have_credentials) esp_wifi_connect();
    } else if (base == WIFI_EVENT && id == WIFI_EVENT_STA_DISCONNECTED) {
        if (s_connected) printf("wifi: disconnected, retrying\n");
        s_connected = false;
        if (s_have_credentials) {
            vTaskDelay(pdMS_TO_TICKS(2000));
            esp_wifi_connect();
        }
    } else if (base == IP_EVENT && id == IP_EVENT_STA_GOT_IP) {
        ip_event_got_ip_t *ev = (ip_event_got_ip_t *)data;
        printf("wifi: connected, ip " IPSTR "\n", IP2STR(&ev->ip_info.ip));
        s_connected = true;
    }
}

static void wifi_init(void)
{
    esp_err_t err = nvs_flash_init();
    if (err == ESP_ERR_NVS_NO_FREE_PAGES || err == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_ERROR_CHECK(nvs_flash_erase());
        ESP_ERROR_CHECK(nvs_flash_init());
    }
    ESP_ERROR_CHECK(esp_netif_init());
    ESP_ERROR_CHECK(esp_event_loop_create_default());
    esp_netif_create_default_wifi_sta();
    wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
    ESP_ERROR_CHECK(esp_wifi_init(&cfg));
    ESP_ERROR_CHECK(esp_event_handler_register(WIFI_EVENT, ESP_EVENT_ANY_ID, on_wifi_event, NULL));
    ESP_ERROR_CHECK(esp_event_handler_register(IP_EVENT, IP_EVENT_STA_GOT_IP, on_wifi_event, NULL));
    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));

    /* Credentials saved by a previous "wifi" command live in NVS (WIFI_STORAGE_FLASH). */
    wifi_config_t wc = {0};
    esp_wifi_get_config(WIFI_IF_STA, &wc);
    s_have_credentials = wc.sta.ssid[0] != 0;
    if (s_have_credentials) printf("wifi: connecting to %s\n", (char *)wc.sta.ssid);
    else printf("wifi: not configured, send: wifi <ssid> <password>\n");
    ESP_ERROR_CHECK(esp_wifi_start());
}

static void wifi_set_credentials(const char *args)
{
    /* "<ssid possibly with spaces> <password>"; a single word means an open network. */
    char buf[128];
    strlcpy(buf, args, sizeof(buf));
    char *pass = strrchr(buf, ' ');
    wifi_config_t wc = {0};
    if (pass) {
        *pass++ = 0;
        strlcpy((char *)wc.sta.password, pass, sizeof(wc.sta.password));
    }
    strlcpy((char *)wc.sta.ssid, buf, sizeof(wc.sta.ssid));
    if (!wc.sta.ssid[0]) {
        printf("usage: wifi <ssid> <password>\n");
        return;
    }
    s_have_credentials = true;
    esp_wifi_disconnect();
    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &wc));
    printf("wifi: saved, connecting to %s\n", (char *)wc.sta.ssid);
    esp_wifi_connect();
}

static int current_rssi(void)
{
    wifi_ap_record_t ap;
    if (s_connected && esp_wifi_sta_get_ap_info(&ap) == ESP_OK) return ap.rssi;
    return -100;
}

/* ------------------------------------------------------------ speed test */

static esp_http_client_handle_t new_client(const char *url)
{
    esp_http_client_config_t cfg = {
        .url = url,
        .crt_bundle_attach = esp_crt_bundle_attach,
        .timeout_ms = 15000,
        .keep_alive_enable = true,
        .buffer_size = CHUNK,
    };
    return esp_http_client_init(&cfg);
}

/* GET url and discard the body; returns bytes read or -1. */
static int get_discard(esp_http_client_handle_t c, char *buf)
{
    esp_http_client_set_method(c, HTTP_METHOD_GET);
    if (esp_http_client_open(c, 0) != ESP_OK) return -1;
    esp_http_client_fetch_headers(c);
    int status = esp_http_client_get_status_code(c);
    int total = 0, n;
    while ((n = esp_http_client_read(c, buf, CHUNK)) > 0) total += n;
    esp_http_client_close(c);
    return status == 200 ? total : -1;
}

static void speedtest_task(void *arg)
{
    char *buf = malloc(CHUNK);
    esp_http_client_handle_t c = buf ? new_client(PING_URL) : NULL;
    if (!c) {
        printf("speedtest: failed out of memory\n");
        goto done;
    }

    /* Latency: second request on a warm TLS connection. */
    if (get_discard(c, buf) < 0) {
        printf("speedtest: failed cannot reach speed.cloudflare.com\n");
        goto done;
    }
    int64_t t0 = now_ms();
    get_discard(c, buf);
    int ping_ms = (int)(now_ms() - t0);

    /* Download */
    esp_http_client_set_url(c, DOWN_URL);
    t0 = now_ms();
    int got = get_discard(c, buf);
    double down_s = (now_ms() - t0) / 1000.0;
    if (got <= 0) {
        printf("speedtest: failed download\n");
        goto done;
    }

    /* Upload */
    memset(buf, 'x', CHUNK);
    esp_http_client_set_url(c, UP_URL);
    esp_http_client_set_method(c, HTTP_METHOD_POST);
    esp_http_client_set_header(c, "Content-Type", "application/octet-stream");
    t0 = now_ms();
    int sent = 0;
    if (esp_http_client_open(c, UP_BYTES) == ESP_OK) {
        while (sent < UP_BYTES) {
            int n = esp_http_client_write(c, buf, CHUNK);
            if (n <= 0) break;
            sent += n;
        }
        esp_http_client_fetch_headers(c);
        while (esp_http_client_read(c, buf, CHUNK) > 0) {
        }
        esp_http_client_close(c);
    }
    double up_s = (now_ms() - t0) / 1000.0;

    printf("down_mbps=%.1f up_mbps=%.1f ping_ms=%d\n",
           got * 8.0 / down_s / 1e6, sent > 0 ? sent * 8.0 / up_s / 1e6 : 0.0, ping_ms);

done:
    if (c) esp_http_client_cleanup(c);
    free(buf);
    s_test_running = false;
    vTaskDelete(NULL);
}

/* -------------------------------------------------------------- commands */

static void handle_command(char *line)
{
    if (strcmp(line, "speedtest") == 0) {
        if (!s_connected) {
            printf("speedtest: failed wifi not connected\n");
        } else if (s_test_running) {
            printf("speedtest: already running\n");
        } else {
            s_test_running = true;
            printf("speedtest: running\n");
            xTaskCreate(speedtest_task, "speedtest", 8192, NULL, 4, NULL);
        }
    } else if (strncmp(line, "wifi ", 5) == 0) {
        wifi_set_credentials(line + 5);
    } else if (strcmp(line, "status") == 0) {
        wifi_config_t wc = {0};
        esp_wifi_get_config(WIFI_IF_STA, &wc);
        printf("status: wifi %s, ssid %s\n", s_connected ? "connected" : "not connected",
               wc.sta.ssid[0] ? (char *)wc.sta.ssid : "(none)");
    } else if (line[0]) {
        printf("err unknown command: %s\n", line);
    }
}

void app_main(void)
{
    ESP_ERROR_CHECK(uart_driver_install(CONSOLE_UART, 256, 0, 0, NULL, 0));
    printf("wifi_speedtest booted\n");
    wifi_init();

    char line[160];
    size_t len = 0;
    int64_t next = now_ms();
    for (;;) {
        uint8_t ch;
        while (uart_read_bytes(CONSOLE_UART, &ch, 1, 0) == 1) {
            if (ch == '\n' || ch == '\r') {
                line[len] = 0;
                len = 0;
                handle_command(line);
            } else if (len < sizeof(line) - 1) {
                line[len++] = (char)ch;
            }
        }
        if (now_ms() >= next) {
            next += 500;
            printf("ticks=%lld rssi=%d\n", (long long)now_ms(), current_rssi());
        }
        vTaskDelay(pdMS_TO_TICKS(20));
    }
}
