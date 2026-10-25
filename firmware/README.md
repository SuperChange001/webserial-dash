# Firmware examples

Each sketch here prints exactly what one of the example dashboards in
[`dashboards/`](../dashboards) expects, so you can go from "blinking board" to a live
dashboard without editing any config. Open the app, append `?dashboard=<id>` to the URL,
pick the port, and click **Connect**. All examples use **115200 baud**.

| Firmware | Dashboard id | Open with | What it prints |
| --- | --- | --- | --- |
| [`arduino/csv_sensor/csv_sensor.ino`](arduino/csv_sensor/csv_sensor.ino) | `demo-sensor` | `?dashboard=demo-sensor` | `temp,hum,vbat,fan` CSV at 10 Hz; answers `fan 1`, `fan 0`, `status` |
| [`esp-idf/csv_sensor/`](esp-idf/csv_sensor) | `demo-sensor` | `?dashboard=demo-sensor` | Same protocol, native ESP-IDF (`printf` on the console UART) |
| [`arduino/teleplot/teleplot.ino`](arduino/teleplot/teleplot.ino) | `teleplot` | `?dashboard=teleplot` | `>sin:…`, `>saw:…`, `>noise:…` Teleplot lines at 20 Hz |
| [`arduino/esp_log_style/esp_log_style.ino`](arduino/esp_log_style/esp_log_style.ino) | `esp-log` | `?dashboard=esp-log` | `I (1300) sensor: T=23.5C H=41% V=3.70` every 500 ms plus `W`/`E` lines |

Add `&demo` to any URL to run the same dashboard against the built-in simulator instead
of hardware.

## Flashing

**Arduino IDE** — open the `.ino`, choose your board and port, click Upload. The sketches
use only the core `Serial` API, so they build for AVR (Uno/Nano), SAMD, RP2040, ESP8266
and ESP32 boards without extra libraries.

**arduino-cli** — for example on an ESP32 dev board:

```sh
arduino-cli compile --fqbn esp32:esp32:esp32 firmware/arduino/csv_sensor
arduino-cli upload  --fqbn esp32:esp32:esp32 -p /dev/ttyUSB0 firmware/arduino/csv_sensor
```

Swap `esp32:esp32:esp32` for `arduino:avr:uno`, `rp2040:rp2040:rpipico`, etc.

**ESP-IDF (`idf.py`)** — from `firmware/esp-idf/csv_sensor`:

Requires ESP-IDF v5.3 or newer (uses the `esp_driver_uart` component). Tested on ESP-IDF v6.1 with an Adafruit ESP32 Feather (CP2104).

```sh
idf.py set-target esp32        # or esp32s3, esp32c3, ...
idf.py build flash             # add -p /dev/ttyUSB0 if auto-detect fails
```

Do not run `idf.py monitor` while the browser is connected; it would take the port.

## Before you click Connect

Only one program can hold a serial port at a time. **Close the Arduino IDE Serial
Monitor / Serial Plotter** (and `idf.py monitor`, `screen`, `minicom`, PlatformIO's monitor,
…) before connecting from the browser, otherwise the port will not appear in the chooser
or `open()` will fail with "port busy".

Other hints:

- Opening the port usually resets the board (DTR toggles the auto-reset line), so the
  first lines you see are the boot banner and the CSV header.
- The CSV parser ignores lines that are not all-numeric, which is why the command
  replies (`ok fan=1`, `status fan=0 uptime=12s`) land in the terminal widget without
  disturbing the plots. Avoid starting lines with `#`: that is treated as a column header.
- On Linux you may need to be in the `dialout` (Debian/Ubuntu) or `uucp` (Arch) group to
  open `/dev/ttyUSB*` / `/dev/ttyACM*`.
