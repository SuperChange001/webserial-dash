/*
 * esp_log_style.ino — companion firmware for the "esp-log" dashboard.
 *
 * Mimics the ESP-IDF logging format ("<level> (<ms>) <tag>: <message>") without
 * depending on ESP-IDF, so it runs on any Arduino-compatible board. Every 500 ms
 * it prints a sensor line such as
 *
 *     I (1300) sensor: T=23.5C H=41% V=3.70
 *
 * which the dashboard mines with the regex
 *
 *     T=(?<temp>[-\d.]+)C H=(?<hum>\d+)% V=(?<vbat>[\d.]+)
 *
 * Occasional warning/error lines ("W (1400) wifi: retry 1", "E (...) mqtt: ...")
 * exercise the log widget's "^[WE] " filter. 115200 baud.
 *
 * Open the dashboard with ?dashboard=esp-log. On a real ESP32 you can get the
 * same output from ESP-IDF with:
 *     ESP_LOGI("sensor", "T=%.1fC H=%d%% V=%.2f", temp, hum, vbat);
 */

#include <Arduino.h>
#include <math.h>

static const unsigned long BAUD = 115200;
static const unsigned long LOG_PERIOD_MS = 500;

static unsigned long lastLog = 0;
static unsigned int lineCount = 0;
static unsigned int wifiRetries = 0;

// Print the "<level> (<ms>) <tag>: " prefix, like esp_log's default formatter.
static void logPrefix(char level, const __FlashStringHelper* tag) {
  Serial.print(level);
  Serial.print(F(" ("));
  Serial.print(millis());
  Serial.print(F(") "));
  Serial.print(tag);
  Serial.print(F(": "));
}

void setup() {
  Serial.begin(BAUD);
  logPrefix('I', F("main"));
  Serial.println(F("boot ok"));
}

void loop() {
  unsigned long now = millis();
  if (now - lastLog < LOG_PERIOD_MS) return;
  lastLog += LOG_PERIOD_MS;
  if (now - lastLog > LOG_PERIOD_MS) lastLog = now;

  // Slowly drifting simulated readings. Swap in real sensors here.
  float t = (float)now / 1000.0f;
  float temp = 23.5f + 2.0f * sinf(t / 10.0f);                 // 21.5..25.5 °C
  int hum = 41 + (int)lroundf(3.0f * sinf(t / 7.0f));          // 38..44 %
  float vbat = 3.70f - (float)(now % 600000UL) / 600000.0f * 0.3f;  // 3.70 -> 3.40 V over 10 min

  logPrefix('I', F("sensor"));
  Serial.print(F("T="));
  Serial.print(temp, 1);
  Serial.print(F("C H="));
  Serial.print(hum);
  Serial.print(F("% V="));
  Serial.println(vbat, 2);

  // Sprinkle in warnings/errors so the filtered log widget has something to show.
  lineCount++;
  if (lineCount % 7 == 3) {
    logPrefix('W', F("wifi"));
    Serial.print(F("retry "));
    Serial.println(++wifiRetries);
  } else if (lineCount % 23 == 11) {
    logPrefix('E', F("mqtt"));
    Serial.println(F("publish failed"));
  }
}
