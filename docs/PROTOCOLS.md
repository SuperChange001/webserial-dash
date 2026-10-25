# Device protocols

What each parser expects on the wire, with matching firmware snippets. Parsers live in `src/core/parsers/<type>/index.ts`; config keys and defaults are in `docs/CONFIG.md`. Fixtures used by the tests are in `tests/fixtures/`.

## Choosing a format

**Recommended for new firmware: `kv` lines with a tick counter**, for example

```c
Serial.printf("ticks=%lu temp=%.1f hum=%d\n", millis(), t, h);
```

The firmware is then the only place that names signals. Add a value to the print and it shows up
on the dashboard; a dashboard without widgets builds tiles and plots for every name automatically
(`?dashboard=quickstart`, firmware in `firmware/arduino/quickstart_kv`).

| Format | Board prints | Where names come from | Use when |
|---|---|---|---|
| `kv` | `temp=21.5 hum=40` | firmware | default choice; readable in any terminal |
| `teleplot` | `>temp:21.5` | firmware | firmware already uses Teleplot |
| `json` | `{"temp":21.5,"imu":{"ax":0.1}}` | firmware | nested or structured data |
| `csv` + `#` header | `# temp hum` once, then `21.5 40` | firmware (header line) | shorter lines; header must be printed after every reset |
| `csv` + `fields` | `21.5,40` | dashboard JSON, by column position | existing firmware you cannot change; reordering columns silently mislabels data |
| `regex` | `I (1300) sensor: T=21.5C` | dashboard JSON, named groups | mining existing log output |
| `binary` | raw struct bytes | dashboard JSON, `fields` | very high rates where text is too slow |

Text formats comfortably handle a few hundred lines per second at 115200 baud and a few
thousand at 921600. Above that consider `binary`.

## Device timestamps

The firmware may always send a tick counter such as `ticks=<millis()>`; it costs a few bytes and
the dashboard decides whether to use it:

```json
"source": { "parser": { "type": "kv" },
            "timestamp": { "field": "ticks", "ticksPerSecond": 1000, "use": true } }
```

- `use: true` stamps every sample of that line with the device time. USB and the operating
  system deliver serial data in bursts; device time keeps the real spacing between samples.
- `use: false`, or no `timestamp` block, keeps the time the browser received the line. The
  counter is still stored and exported like any other column.
- Device time is anchored to the PC clock at the first line. A reboot or counter wrap
  (ticks going backwards) re-anchors automatically; so does drift beyond `maxDriftMs`.
- Use `ticksPerSecond: 1000000` for `micros()` or ESP-IDF `esp_timer_get_time()`.

Other parsers can carry a timestamp too: `json` with `timeKey`, and Teleplot's `>name:ts:value`
(epoch milliseconds).

## General rules

- Default framing is newline-delimited; `\r\n` works out of the box (the trailing `\r` is stripped). One frame = one parse call.
- Parsers emit raw numbers; apply calibration with `signals.<name>.scale/offset` instead of in firmware.
- Non-numeric lines are harmless: they produce no samples but still appear in the `terminal` and `log` widgets. That is the intended channel for debug text and command replies.
- `Serial.printf("%f")` does not work on AVR Arduino cores; use `Serial.print(value, decimals)` there. ESP32/ESP8266/RP2040 cores support `printf`.

## csv

Device output:

```
temp,hum,vbat,fan
23.5,41,3.70,0
23.6,41,3.70,1
```

Config: `{ "type": "csv", "separator": ",", "fields": ["temp","hum","vbat","fan"] }`

- `fields` names the columns; `""` skips one; extra columns become `colN`.
- Header lines: a first line such as `temp,hum,vbat,fan` is learned as column names only when `fields` is empty. A line starting with `#` (`# temp hum pressure`, the atomic14/web-serial-plotter convention) always renames the columns, even when `fields` is set, so do not start reply lines with `#`.
- `"separator": " "` splits on any whitespace run (`23.5 41 1013.2`).

```cpp
// ESP32 / RP2040
Serial.printf("%.1f,%d,%.2f,%d\n", temp, hum, vbat, fanOn ? 1 : 0);
// AVR-safe
Serial.print(temp, 1); Serial.print(','); Serial.print(hum); Serial.print(',');
Serial.print(vbat, 2); Serial.print(','); Serial.println(fanOn ? 1 : 0);
```

Example: `dashboards/demo-sensor.json`, firmware `firmware/arduino/csv_sensor/`.

## kv

Device output (any mix of `=`/`:` and `,`/`;`/space separators):

```
temp=23.5 hum=41 vbat=3.70
T:23.5,H:41;V:3.70
```

Config: `{ "type": "kv" }` (optionally `pairSeparator`, `kvSeparator` as regex strings).

- Keys become signal names verbatim (case-sensitive, trimmed).
- Pairs whose value is not numeric (`state=idle`) are skipped; `true`/`false` map to 1/0.

```cpp
Serial.printf("temp=%.1f hum=%d vbat=%.2f\n", temp, hum, vbat);
```

## json

Device output, one object per line:

```
{"temp":23.5,"hum":41,"imu":{"ax":0.01,"ay":-0.02},"ok":true}
{"ts":123456,"data":{"temp":23.6}}
```

Config: `{ "type": "json" }`; with `"path": "data"` the values are read from `obj.data`; with `"timeKey": "ts"` the device timestamp (ms) is used as sample time and excluded from the signals.

- Nested objects flatten to dotted names (`imu.ax`), arrays to indexes (`g.0`). Booleans → 1/0, numeric strings → numbers, other strings ignored.
- Frames not starting with `{` or `[` are ignored.

```cpp
Serial.printf("{\"temp\":%.1f,\"hum\":%d,\"imu\":{\"ax\":%.3f}}\n", temp, hum, ax);
// or with ArduinoJson: serializeJson(doc, Serial); Serial.println();
```

## teleplot

Device output ([Teleplot format](https://github.com/nesnes/teleplot#data-format)):

```
>temp:23.5
>temp:1700000000000:23.6§°C
>acc:1;2;3
>text:hello|t
```

Config: `{ "type": "teleplot" }`; set `"requirePrefix": false` to also accept `temp:23.5` without `>`.

- `>name:value` → one sample; `>name:ts:value` → `ts` (ms) becomes the sample time; `>name:v1;v2;v3` → three samples; `§unit` and `|flags` are stripped (declare units in `signals` instead). Text values yield nothing.
- Signal names are discovered automatically; a `table` widget with empty `signals` shows them all.

```cpp
Serial.printf(">temp:%.1f\n>hum:%d\n", temp, hum);
// with unit (ignored by the parser, kept for Teleplot compatibility)
Serial.printf(">vbat:%.2f§V\n", vbat);
```

Example: `dashboards/teleplot.json`, firmware `firmware/arduino/teleplot/`.

## regex

For free-form logs where numbers are embedded in text:

```
I (1300) sensor: T=23.5C H=41% V=3.70
W (1400) wifi: retry 1
```

Config: `{ "type": "regex", "pattern": "T=(?<temp>[-\\d.]+)C H=(?<hum>\\d+)% V=(?<vbat>[\\d.]+)" }`

- JavaScript regex syntax; each **named** group whose text is numeric becomes a signal. Unnamed groups are ignored.
- In JSON every regex backslash is doubled (`\\d`). Test patterns in the browser console with `new RegExp(pattern)`.
- `"flags": "g"` collects every match on the line (`(?<n>\\d+)` over `a1 b22` → two `n` samples); without `g` only the first match counts.

```cpp
ESP_LOGI("sensor", "T=%.1fC H=%d%% V=%.2f", temp, hum, vbat);           // ESP-IDF
Serial.printf("I (%lu) sensor: T=%.1fC H=%d%% V=%.2f\n", millis(), temp, hum, vbat);  // Arduino
```

Example: `dashboards/esp-log.json`, firmware `firmware/arduino/esp_log_style/`.

## binary

Fixed-layout records. Combine with `length` framing (fixed size, no markers) or `startEnd` framing with `includeMarkers: true` and a parser `offset` that skips the header bytes.

Format string: optional byte order then one code per field.

| Code | Type | Bytes | Code | Type | Bytes |
|---|---|---|---|---|---|
| `<` | little-endian (default) | – | `>` | big-endian | – |
| `b` | int8 | 1 | `B` | uint8 | 1 |
| `h` | int16 | 2 | `H` | uint16 | 2 |
| `i` | int32 | 4 | `I` | uint32 | 4 |
| `q` | int64 | 8 | `Q` | uint64 | 8 |
| `f` | float32 | 4 | `d` | float64 | 8 |
| `x` | pad byte (no field) | 1 | | | |

- No alignment: fields are packed exactly as listed, so use `__attribute__((packed))` structs on the device.
- `fields` lists one name per non-pad code; `""` skips a field; missing names become `f0`, `f1`….
- `q`/`Q` are converted through `Number`; values above 2^53 lose precision.
- Frames shorter than `offset + size(format)` are dropped silently.

Example: 9-byte frame `0xAA | seq:uint16 | temp:int16 (x100) | v:float32`, little-endian, terminated by `0x55`:

```json
"framing": { "mode": "startEnd", "start": "\\xAA", "end": "\\x55", "includeMarkers": true },
"parser": { "type": "binary", "format": "<Hhf", "fields": ["seq", "temp", "v"], "offset": 1 },
"signals": { "temp": { "scale": 0.01, "unit": "°C" } }
```

```cpp
struct __attribute__((packed)) Pkt { uint8_t start; uint16_t seq; int16_t temp_x100; float v; uint8_t end; };
Pkt p = { 0xAA, seq++, (int16_t)(temp * 100), vbat, 0x55 };
Serial.write((const uint8_t*)&p, sizeof p);
```

For fixed records without markers use `"framing": { "mode": "length", "length": 8 }` and `"offset": 0`. Binary dashboards cannot use `simulate` (it only generates text); test them with a unit test like the one in `src/core/parsers/parsers.test.ts`.

## Choosing framing for odd devices

| Device behaviour | Framing |
|---|---|
| Lines end with `\n` or `\r\n` | default |
| Lines end with bare `\r` | `{ "mode": "delimiter", "delimiter": "\\r" }` |
| NUL-terminated records | `{ "mode": "delimiter", "delimiter": "\\x00" }` |
| `$…;` / `<…>` text frames with junk between | `startEnd` with `start`/`end` |
| Fixed-size binary | `length` |

## Commands to the device

The `terminal` input box and `button` widgets send text plus a selectable line ending (`\n`, `\r\n`, `\r`, none); escapes such as `\x02` in button `send` strings are interpreted. Firmware should read until `\n`/`\r` and reply on its own line (see `firmware/arduino/csv_sensor/` for a small command loop).
