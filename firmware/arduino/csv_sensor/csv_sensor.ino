/*
 * csv_sensor.ino — companion firmware for the "demo-sensor" dashboard.
 *
 * Prints one CSV line per 100 ms (10 Hz) at 115200 baud:
 *
 *     temp,hum,vbat,fan
 *     23.5,41,3.70,0
 *
 * and accepts newline-terminated commands from the host:
 *
 *     fan 1     -> turns the (simulated) fan on,  replies "ok fan=1"
 *     fan 0     -> turns the fan off,             replies "ok fan=0"
 *     status    -> replies "status fan=0 uptime=12s"
 *
 * Replies are printed on their own lines. The dashboard's CSV parser ignores any
 * line whose cells are not all numeric, so replies show up in the terminal widget
 * without disturbing the plots. Do not start reply lines with '#': the parser
 * treats "# a,b,c" as a header that renames the columns.
 *
 * The sketch only uses the Arduino core API, so it compiles unchanged on AVR
 * (Uno/Nano), SAMD, RP2040, ESP8266 and ESP32 boards. By default the values are
 * synthesised from millis(); see readSensors() for where to plug in real hardware.
 *
 * Open the dashboard with ?dashboard=demo-sensor and click Connect. Close the
 * Arduino IDE Serial Monitor first — only one program can own the port.
 */

#include <Arduino.h>
#include <math.h>

static const unsigned long BAUD = 115200;
static const unsigned long SAMPLE_PERIOD_MS = 100;  // 10 Hz

// ---- device state --------------------------------------------------------

static bool fanOn = false;          // toggled by "fan 1" / "fan 0"
static unsigned long lastSample = 0;

// Line buffer for incoming commands.
static char cmdBuf[32];
static size_t cmdLen = 0;

// ---- simulated signals ---------------------------------------------------
// Periods and ranges mirror dashboards/demo-sensor.json's "simulate" section.

// Phase in [0,1) of a waveform with the given period.
static float phase(unsigned long now, unsigned long periodMs) {
  return (float)(now % periodMs) / (float)periodMs;
}

static float sine(unsigned long now, float lo, float hi, unsigned long periodMs) {
  float s = (sinf(phase(now, periodMs) * TWO_PI) + 1.0f) * 0.5f;  // 0..1
  return lo + s * (hi - lo);
}

static float triangle(unsigned long now, float lo, float hi, unsigned long periodMs) {
  float p = phase(now, periodMs);
  float tri = p < 0.5f ? p * 2.0f : (1.0f - p) * 2.0f;  // 0..1..0
  return lo + tri * (hi - lo);
}

static float sawtooth(unsigned long now, float lo, float hi, unsigned long periodMs) {
  return lo + phase(now, periodMs) * (hi - lo);
}

// ---- sensor readout ------------------------------------------------------

struct Reading {
  float temp;  // °C
  int hum;     // %RH
  float vbat;  // V
};

static Reading readSensors(unsigned long now) {
  Reading r;

  // Simulated values. Replace with real sensors, e.g.:
  //
  //   #include <DHT.h>                       // DHT22 on pin 2
  //   static DHT dht(2, DHT22);              // call dht.begin() in setup()
  //   r.temp = dht.readTemperature();
  //   r.hum  = (int)dht.readHumidity();
  //
  //   // Battery through a 2:1 divider on A0 with a 3.3 V reference:
  //   r.vbat = analogRead(A0) * (3.3f / 1023.0f) * 2.0f;
  //
  r.temp = sine(now, 18.0f, 92.0f, 20000);
  r.hum = (int)lroundf(triangle(now, 30.0f, 70.0f, 15000));
  r.vbat = sawtooth(now, 3.3f, 4.2f, 60000);

  // A running fan would really cool things down a bit.
  if (fanOn) r.temp -= 2.0f;

  return r;
}

// ---- command handling ----------------------------------------------------

static void handleCommand(char* line) {
  // Trim leading/trailing whitespace in place.
  while (*line == ' ' || *line == '\t') line++;
  size_t n = strlen(line);
  while (n > 0 && (line[n - 1] == ' ' || line[n - 1] == '\t' || line[n - 1] == '\r')) line[--n] = '\0';
  if (n == 0) return;

  if (strcmp(line, "fan 1") == 0) {
    fanOn = true;
    // digitalWrite(FAN_PIN, HIGH);
    Serial.println(F("ok fan=1"));
  } else if (strcmp(line, "fan 0") == 0) {
    fanOn = false;
    // digitalWrite(FAN_PIN, LOW);
    Serial.println(F("ok fan=0"));
  } else if (strcmp(line, "status") == 0) {
    Serial.print(F("status fan="));
    Serial.print(fanOn ? 1 : 0);
    Serial.print(F(" uptime="));
    Serial.print(millis() / 1000);
    Serial.println(F("s"));
  } else {
    Serial.print(F("err unknown command: "));
    Serial.println(line);
  }
}

// Accumulate bytes into cmdBuf; dispatch on '\n' (or '\r' for terminals that send CR).
static void pollCommands() {
  while (Serial.available() > 0) {
    char c = (char)Serial.read();
    if (c == '\n' || c == '\r') {
      cmdBuf[cmdLen] = '\0';
      handleCommand(cmdBuf);
      cmdLen = 0;
    } else if (cmdLen < sizeof(cmdBuf) - 1) {
      cmdBuf[cmdLen++] = c;
    } else {
      cmdLen = 0;  // overflow: drop the garbage line
    }
  }
}

// ---- Arduino entry points -------------------------------------------------

void setup() {
  Serial.begin(BAUD);
  // pinMode(FAN_PIN, OUTPUT);

  // Optional header line: the dashboard already knows the column names from its
  // config, but this makes raw captures self-describing.
  Serial.println(F("temp,hum,vbat,fan"));
}

void loop() {
  pollCommands();

  unsigned long now = millis();
  if (now - lastSample < SAMPLE_PERIOD_MS) return;
  lastSample += SAMPLE_PERIOD_MS;
  if (now - lastSample > SAMPLE_PERIOD_MS) lastSample = now;  // catch up after a stall

  Reading r = readSensors(now);

  // Serial.print(float, digits) works on every core; printf("%f") does not on AVR.
  Serial.print(r.temp, 1);
  Serial.print(',');
  Serial.print(r.hum);
  Serial.print(',');
  Serial.print(r.vbat, 2);
  Serial.print(',');
  Serial.println(fanOn ? 1 : 0);
}
