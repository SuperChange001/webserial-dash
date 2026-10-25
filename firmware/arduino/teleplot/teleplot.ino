/*
 * teleplot.ino — companion firmware for the "teleplot" dashboard.
 *
 * Emits Teleplot-style lines (https://github.com/nesnes/teleplot#data-format)
 * at 20 Hz, 115200 baud:
 *
 *     >sin:0.707
 *     >saw:4.20
 *     >noise:-0.013
 *
 * The dashboard's Teleplot parser discovers signal names automatically, so you
 * can add your own ">name:value" lines and they will appear in the table and
 * log widgets; the example plot is pre-wired to sin/saw/noise.
 *
 * Portable Arduino core API only — runs on AVR, SAMD, RP2040, ESP8266, ESP32.
 * Open the dashboard with ?dashboard=teleplot.
 */

#include <Arduino.h>
#include <math.h>

static const unsigned long BAUD = 115200;
static const unsigned long SAMPLE_PERIOD_MS = 50;  // 20 Hz

static unsigned long lastSample = 0;

// Emit one Teleplot sample: ">name:value\n".
static void plot(const __FlashStringHelper* name, float value, uint8_t decimals) {
  Serial.print('>');
  Serial.print(name);
  Serial.print(':');
  Serial.println(value, decimals);
}

// Uniform random float in [lo, hi].
static float randomFloat(float lo, float hi) {
  return lo + (hi - lo) * (float)random(0, 10001) / 10000.0f;
}

void setup() {
  Serial.begin(BAUD);
  randomSeed(analogRead(A0));
}

void loop() {
  unsigned long now = millis();
  if (now - lastSample < SAMPLE_PERIOD_MS) return;
  lastSample += SAMPLE_PERIOD_MS;
  if (now - lastSample > SAMPLE_PERIOD_MS) lastSample = now;  // catch up after a stall

  // Periods mirror dashboards/teleplot.json: 3 s sine, 5 s sawtooth, white noise.
  float sinV = sinf((float)(now % 3000) / 3000.0f * TWO_PI);          // -1..1
  float sawV = (float)(now % 5000) / 5000.0f * 10.0f;                 // 0..10
  float noiseV = randomFloat(-0.2f, 0.2f);                            // -0.2..0.2

  plot(F("sin"), sinV, 3);
  plot(F("saw"), sawV, 2);
  plot(F("noise"), noiseV, 3);
}
