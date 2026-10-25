/*
 * WebSerial Dash quick start: the recommended way to send data.
 *
 * Print one line per sample as  name=value  pairs separated by spaces:
 *
 *     ticks=12345 temp=21.5 hum=40 light=431
 *
 * - Every name you print becomes a signal on the dashboard automatically
 *   (dashboard "quickstart": a value tile per signal, one plot, a stats table).
 * - Add or remove a pair here and the dashboard follows; no JSON edit needed.
 * - `ticks` is the board's own clock (millis()). The dashboard uses it to time
 *   samples precisely (source.timestamp); remove that block in the JSON and it is
 *   just recorded like any other column. Sending it never hurts.
 * - Lines without "=" (boot messages, debug prints) are ignored by the parser but
 *   still visible in the terminal.
 *
 * Open: https://superchange001.github.io/webserial-dash/?dashboard=quickstart
 */

const unsigned long PERIOD_MS = 100;  // 10 Hz
unsigned long nextAt = 0;

void setup() {
  Serial.begin(115200);
  Serial.println("quickstart_kv booted");  // ignored by the kv parser, shown in terminal
}

void loop() {
  unsigned long now = millis();
  if ((long)(now - nextAt) < 0) return;
  nextAt = now + PERIOD_MS;

  // Replace these with real readings, e.g. analogRead(A0) or a sensor library.
  float temp = 25.0 + 5.0 * sin(now / 20000.0 * 2 * PI);
  int hum = 45 + (int)(10 * sin(now / 15000.0 * 2 * PI));
  int light = analogRead(A0);

  Serial.print("ticks=");  Serial.print(now);
  Serial.print(" temp=");  Serial.print(temp, 1);
  Serial.print(" hum=");   Serial.print(hum);
  Serial.print(" light="); Serial.println(light);
}
