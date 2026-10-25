/*
 * WebSerial Dash example for dashboards/wifi-speedtest.json (ESP32, Arduino core 2.x/3.x).
 *
 * Output protocol (key=value lines, parsed by the "kv" parser):
 *   every 500 ms:            ticks=<millis> rssi=<dBm>
 *   after "speedtest":       speedtest: running
 *                            down_mbps=<f> up_mbps=<f> ping_ms=<n>
 *   on failure:              speedtest: failed <reason>
 *
 * Commands (one per line): speedtest
 *
 * The speed test uses Cloudflare's public endpoints over HTTPS. Results are rough
 * (ESP32 TLS throughput is CPU bound) but fine for comparing locations and antennas.
 *
 * STATUS: written for the walkthrough in docs/CUSTOMIZE.md; not yet compiled or run on
 * hardware by the maintainers. Please report issues.
 */
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>

const char *WIFI_SSID = "your-ssid";
const char *WIFI_PASS = "your-password";

const char *DOWN_URL = "https://speed.cloudflare.com/__down?bytes=2000000";  // 2 MB
const char *UP_URL = "https://speed.cloudflare.com/__up";
const char *PING_URL = "https://speed.cloudflare.com/__down?bytes=0";
const size_t UP_CHUNK = 32 * 1024;
const int UP_CHUNKS = 8;  // 256 KB total

unsigned long nextRssiAt = 0;
String line;

void setup() {
  Serial.begin(115200);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.println("wifi: connecting");  // lines without '=' are ignored by the parser
}

static bool runSpeedtest() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("speedtest: failed not connected");
    return false;
  }
  Serial.println("speedtest: running");
  WiFiClientSecure client;
  client.setInsecure();  // no certificate pinning in an example
  HTTPClient http;
  http.setReuse(true);

  // Ping: latency of an empty request on an already open connection.
  if (!http.begin(client, PING_URL) || http.GET() != 200) {
    Serial.println("speedtest: failed ping");
    http.end();
    return false;
  }
  http.getString();
  unsigned long t0 = millis();
  http.GET();
  http.getString();
  unsigned long pingMs = millis() - t0;
  http.end();

  // Download
  http.begin(client, DOWN_URL);
  t0 = millis();
  int code = http.GET();
  size_t got = 0;
  if (code == 200) {
    WiFiClient *stream = http.getStreamPtr();
    uint8_t buf[2048];
    int len = http.getSize();
    while (http.connected() && (len < 0 || got < (size_t)len)) {
      size_t avail = stream->available();
      if (avail) got += stream->readBytes(buf, min(avail, sizeof(buf)));
      else delay(1);
      if (millis() - t0 > 20000) break;
    }
  }
  float downSec = (millis() - t0) / 1000.0f;
  http.end();
  if (code != 200 || got == 0) {
    Serial.printf("speedtest: failed download http=%d\n", code);
    return false;
  }

  // Upload
  uint8_t *payload = (uint8_t *)malloc(UP_CHUNK);
  if (!payload) {
    Serial.println("speedtest: failed no memory");
    return false;
  }
  memset(payload, 'x', UP_CHUNK);
  size_t sent = 0;
  t0 = millis();
  for (int i = 0; i < UP_CHUNKS; i++) {
    http.begin(client, UP_URL);
    if (http.POST(payload, UP_CHUNK) == 200) sent += UP_CHUNK;
    http.end();
  }
  float upSec = (millis() - t0) / 1000.0f;
  free(payload);

  float downMbps = got * 8.0f / downSec / 1e6f;
  float upMbps = sent * 8.0f / upSec / 1e6f;
  Serial.printf("down_mbps=%.1f up_mbps=%.1f ping_ms=%lu\n", downMbps, upMbps, pingMs);
  return true;
}

void loop() {
  // Commands
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\n' || c == '\r') {
      line.trim();
      if (line == "speedtest") runSpeedtest();
      else if (line.length()) Serial.printf("err unknown command: %s\n", line.c_str());
      line = "";
    } else if (line.length() < 64) {
      line += c;
    }
  }

  // Periodic RSSI (-100 when not associated)
  unsigned long now = millis();
  if ((long)(now - nextRssiAt) >= 0) {
    nextRssiAt = now + 500;
    int rssi = WiFi.status() == WL_CONNECTED ? WiFi.RSSI() : -100;
    Serial.printf("ticks=%lu rssi=%d\n", now, rssi);
  }
}
