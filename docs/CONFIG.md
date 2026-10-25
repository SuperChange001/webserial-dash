# Dashboard JSON reference

Source of truth: `src/config/schema.ts` (zod 4) plus the per-plugin schemas in `src/core/parsers/*/index.ts` and `src/widgets/*/schema.ts`. `pnpm gen:schema` exports it to `schema/dashboard.schema.json`; point `"$schema"` at it for editor completion. Validate with `pnpm validate:dashboards`.

Conventions in this file: **bold** = required; everything else has the listed default or is optional. Strings that carry control characters are written escaped in JSON (`"\\n"`, `"\\r\\n"`, `"\\x02"`); `unescapeString` interprets `\n \r \t \0 \xNN \\` at runtime.

## Top level

| Key | Type | Default | Notes |
|---|---|---|---|
| `$schema` | string | – | Usually `"../schema/dashboard.schema.json"`. |
| **`id`** | string `^[a-z0-9-]+$` | – | URL-safe; used in `?dashboard=<id>`, localStorage and export file names. File must be `dashboards/<id>.json`. |
| **`name`** | string (min 1) | – | Shown in the dashboard picker (built-ins sorted by name). |
| `description` | string | – | Shown under the top bar (hidden on narrow screens). |
| `source` | object | all defaults | Serial settings, framing, parser, simulate. See below. |
| `signals` | record name → meta | `{}` | Presentation metadata; unlisted signals still work. |
| `widgets` | array | `[]` | Empty → auto layout (plot of every discovered signal, table, log, terminal). |
| `options.bufferSamples` | int > 0 | `20000` | Samples kept per signal in memory (ring buffer). |
| `options.timeWindowSec` | number > 0 | `30` | Default plot window. |
| `options.columns` | int 1–24 | `12` | Grid columns on wide screens. |

## `source`

| Key | Type | Default | Notes |
|---|---|---|---|
| `baudRate` | int > 0 | `115200` | The Baud select in the top bar overrides it for the current session. |
| `dataBits` | 7 \| 8 | `8` | |
| `stopBits` | 1 \| 2 | `1` | |
| `parity` | `none` \| `even` \| `odd` | `none` | |
| `flowControl` | `none` \| `hardware` | `none` | |
| `bufferSize` | int > 0 | `65536` | Browser receive buffer in bytes; raise for high rates. |
| `filters` | `[{ usbVendorId, usbProductId? }]` | `[]` | Restricts the port chooser to matching USB devices (decimal ints, e.g. `4292` = 0x10C4). |
| `framing` | object | `{ "mode": "delimiter", "delimiter": "\\n", "maxLength": 4096 }` | See Framing. |
| `parser` | object | `{ "type": "csv", "separator": ",", "fields": [], "header": true }` | See Parsers. |
| `simulate` | object | – | Fake device for Demo mode / `?demo`. See Simulate. |

### Framing (`source.framing`)

| `mode` | Keys | Behaviour |
|---|---|---|
| `delimiter` | `delimiter` (string, default `"\\n"`), `maxLength` (default `4096`) | Frame ends with the delimiter; a trailing `\r` right before it is stripped, so the default handles `\n` and `\r\n`. If no delimiter arrives within `maxLength` bytes the oldest buffered bytes are dropped. |
| `startEnd` | **`start`**, **`end`** (strings, escapes allowed), `maxLength` (`4096`), `includeMarkers` (`false`) | Bytes outside `start…end` are discarded. `includeMarkers: true` passes the markers to the parser (pair with binary `offset`). Buffer is cleared if a frame exceeds `maxLength`. |
| `length` | **`length`** (int > 0) | Fixed-size frames, no markers. |

### Parsers (`source.parser`)

All parsers emit `Sample { name, value, t }` with raw numbers; `signals.<name>.scale/offset` is applied afterwards. Lines that do not parse yield nothing (they still reach the terminal and log widgets). See `docs/PROTOCOLS.md` for device-side examples.

| `type` | Options (default) | Signal names |
|---|---|---|
| `csv` | `separator` (`","`; `" "` = any whitespace), `fields` (`[]`), `header` (`true`) | From `fields`; missing → `col0`, `col1`…; `""` skips a column. A line with non-numeric cells is a header when it starts with `#` (always, overrides `fields`) or when `fields` is empty and every cell is non-numeric. |
| `kv` | `pairSeparator` (regex, `"[,;\\s]+"`), `kvSeparator` (regex, `"[=:]"`) | Keys as printed (trimmed). Pairs with a non-numeric value are skipped. |
| `json` | `path` (dotted, optional), `timeKey` (optional) | Flattened keys (`imu.ax`, arrays `g.0`). Numbers, numeric strings and booleans (1/0) become samples. `timeKey` value (ms) is used as `t` and excluded from signals. Frames not starting with `{`/`[` are ignored. |
| `teleplot` | `requirePrefix` (`true`) | Name before the first `:`. Accepts `>n:v`, `>n:ts:v`, `>n:v1;v2`, `>n:v§unit\|flags` (unit and flags dropped). Lines without `>` are ignored unless `requirePrefix: false`. |
| `regex` | **`pattern`** (JS regex with named groups), `flags` (`""`) | One signal per named group whose text is numeric. Without `g` only the first match counts. Backslashes must be doubled in JSON. |
| `binary` | **`format`** (`^[<>]?[bBhHiIqQfdx]+$`), **`fields`** (names per non-pad code), `offset` (`0`) | From `fields`; missing → `f0`, `f1`…; `""` skips. `<` little-endian (default), `>` big. Frames shorter than `offset + struct size` are ignored. |

### Simulate (`source.simulate`)

Used by `?demo`, the **Demo** button and tests. Without it the Demo button produces one sine signal named `demo` in CSV.

| Key | Type | Default | Notes |
|---|---|---|---|
| `intervalMs` | number > 0 | `100` | Period between generated lines. |
| `format` | `csv` \| `kv` \| `json` \| `teleplot` | `csv` | Must match the parser (validator warns otherwise). `teleplot` emits one line per signal per tick. |
| `lineEnding` | string | `"\\n"` | Appended to each line (also to echo lines). |
| `signals` | array of simulated signals | `[]` | Generated values (ignored when `lines` is set). |
| `lines` | string[] | – | Replayed in a loop verbatim; use for `regex`, log-style or any non-generatable format. |
| `echo` | boolean | `true` | Bytes sent to the device come back as `echo: <text>` lines. |

Simulated signal: `name` (**required**), `waveform` (`sine` default, `square`, `triangle`, `sawtooth`, `noise`, `counter`, `constant`), `min` (`0`), `max` (`100`), `periodMs` (`5000`; `0` = no phase), `decimals` (`2`, 0–10). `counter` yields `min + (n % (max - min + 1))`; `constant` yields `min`; `noise` is uniform in `[min, max]`.

## `signals` (per-name metadata)

| Key | Type | Default | Used by |
|---|---|---|---|
| `label` | string | signal name | Widget titles, plot legend, table rows. |
| `unit` | string | – | Appended to formatted values (`23.5 °C`), plot legend. |
| `scale` | number | `1` | `value = raw * scale + offset`, applied in `Session` before storage/logging. |
| `offset` | number | `0` | |
| `decimals` | int 0–10 | integers → 0, else 2 | Formatting everywhere a widget does not override it. |
| `color` | CSS color | palette pick | Plot line, table swatch, default value/gauge colour. Palette (10 colours) is assigned in first-use order per session. |

## Widgets

Common fields (`src/widgets/base-schema.ts`):

| Key | Type | Default | Notes |
|---|---|---|---|
| **`type`** | string | – | One of the types below. |
| `id` | string | – | Stable React key and `data-widget-id` attribute. |
| `title` | string | signal label (widgets with `signal`), else the type name | Header text. |
| `w` | int 1–24 | per type | Column span. |
| `h` | int 1–24 | per type | Row span; one row is 90 px (80 px under 760 px width). |
| `x`, `y` | int ≥ 0 | – | Pin to a 0-based column/row; omit for auto flow. |

### `thresholds` (value, gauge)

Array of `{ "value": number, "color": "<css>" }`. Steps are sorted by `value`; the step with the **highest `value` <= current value** wins. Below the lowest step the signal colour (`signals.<name>.color` or palette) is used. Example: `[{"value":60,"color":"#eab308"},{"value":80,"color":"#ef4444"}]` → default below 60, yellow 60–80, red ≥ 80. The gauge additionally shades each step's band (from its value to the next step) at 35 % opacity.

### `plot` — streaming line chart (uPlot)

| Key | Type | Default | Notes |
|---|---|---|---|
| **`signals`** | string[] (min 1) | – | One line per signal. |
| `timeWindowSec` | number > 0 | `options.timeWindowSec` | Seconds of history shown; x axis scrolls with `Date.now()`. |
| `yMin`, `yMax` | number | auto | Setting either disables y auto-range for that bound. |
| `legend` | boolean | `true` | |
| `w` / `h` | | `8` / `3` | |

### `value` — big number tile

| Key | Type | Default | Notes |
|---|---|---|---|
| **`signal`** | string | – | |
| `decimals` | int 0–10 | signal meta | |
| `unit` | string | signal meta | |
| `thresholds` | see above | – | Colours the number. |
| `w` / `h` | | `2` / `1` | |

### `gauge` — semicircular gauge

| Key | Type | Default | Notes |
|---|---|---|---|
| **`signal`** | string | – | |
| `min`, `max` | number | `0`, `100` | Arc range; value is clamped. |
| `decimals`, `unit` | | signal meta | |
| `thresholds` | see above | – | Arc colour + shaded bands. |
| `w` / `h` | | `3` / `2` | |

### `led` — on/off indicator

| Key | Type | Default | Notes |
|---|---|---|---|
| **`signal`** | string | – | |
| `when` | `{ op, value }` | `{ ">", 0 }` | `op` ∈ `> >= < <= == !=`; ON when `latest op value`. |
| `onColor` / `offColor` | CSS color | `#22c55e` / `#334155` | |
| `onLabel` / `offLabel` | string | `ON` / `OFF` | Shows `—` until the first sample. |
| `w` / `h` | | `2` / `1` | |

### `table` — latest value and stats

| Key | Type | Default | Notes |
|---|---|---|---|
| `signals` | string[] | `[]` | Rows; empty = every signal seen so far (discovery mode). |
| `stats` | boolean | `true` | Min / Max / Mean / N columns (stats are over all samples since connect/clear, not just the buffer). |
| `w` / `h` | | `4` / `3` | |

### `terminal` — raw serial terminal (xterm.js) with send box

| Key | Type | Default | Notes |
|---|---|---|---|
| `localEcho` | boolean | `false` | Echo keystrokes typed into the terminal area. |
| `lineEnding` | `"\\n"` \| `"\\r\\n"` \| `"\\r"` \| `""` | `"\\n"` | Appended to lines sent from the input box (changeable in the UI). |
| `convertEol` | boolean | `true` | Treat bare `\n` as newline. |
| `fontSize` | int 8–32 | `13` | |
| `scrollback` | int > 0 | `5000` | |
| `w` / `h` | | `12` / `4` | Shows RX bytes only; typed bytes go straight to the device. Input history: 50 entries (arrow keys). |

### `log` — parsed frames as text

| Key | Type | Default | Notes |
|---|---|---|---|
| `maxLines` | int > 0 | `500` | |
| `filter` | regex string | – | Only frames whose text matches are shown. |
| `timestamps` | boolean | `true` | `HH:MM:SS.mmm` receive time. |
| `w` / `h` | | `6` / `3` | Pause/Clear buttons built in; updates every 100 ms. |

### `button` — command buttons

| Key | Type | Default | Notes |
|---|---|---|---|
| **`actions`** | `[{ label, send, color? }]` (min 1) | – | `send` is text with escapes (`"\\x02"`, `"\\n"`). |
| `lineEnding` | `"\\n"` \| `"\\r\\n"` \| `"\\r"` \| `""` | `"\\n"` | Appended to every action. |
| `w` / `h` | | `3` / `1` | Disabled while disconnected. |

## Layout rules

- CSS grid: `repeat(options.columns, 1fr)`, `grid-auto-flow: dense`, 10 px gap, rows of `--row` (90 px).
- Each widget spans `w` columns × `h` rows; with `x`/`y` it is placed at `grid-column: x+1 / span w`, `grid-row: y+1 / span h`. Mixing pinned and flowing widgets is allowed; dense flow fills gaps.
- Under 760 px wide the grid collapses to one column and every widget spans the full width (heights are kept).
- Keep `w` <= `options.columns` (raise `columns`, max 24, for denser layouts); a larger span creates implicit columns that overflow the page.

## Minimal example

```json
{
  "$schema": "../schema/dashboard.schema.json",
  "id": "minimal",
  "name": "Minimal",
  "source": { "parser": { "type": "teleplot" }, "simulate": { "format": "teleplot", "signals": [{ "name": "x" }] } }
}
```

Everything else defaults: 115200 8N1, newline framing, auto layout (plot + table + log + terminal).
