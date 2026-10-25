---
name: customize-dashboard
description: Build or change a WebSerial Dash dashboard JSON when the user describes what their device/board prints over serial (CSV, key=value, JSON, Teleplot, log lines, binary) or asks to add, remove, restyle or re-arrange widgets (gauge, plot, value, led, table, log, terminal, button), set thresholds/colours/units, or change baud rate or framing. Produces dashboards/<id>.json with a matching simulate block; no TypeScript changes.
---

# Customize a dashboard

Everything here is a JSON edit under `dashboards/`. Do not touch `src/` unless the user needs a widget or parser kind that does not exist (then use the `add-widget` / `add-parser` skills). Reference: `docs/CONFIG.md` (every key and default), `docs/PROTOCOLS.md` (line formats).

## Procedure

1. **Get the line format.** Ask for (or infer from the request / firmware source) one or two literal lines the device prints, the rate, the baud rate (default 115200) and the line ending (default `\n`; CRLF is also handled by the default framer).
2. **Pick the parser** (`source.parser.type`):
   | Device prints | Parser | Notes |
   |---|---|---|
   | `23.5,41,3.70` | `csv` | set `fields`; `separator: " "` for whitespace columns; optional `# a b c` header |
   | `T=23.5 H=41` / `T:23.5,H:41` | `kv` | keys become signal names; defaults split on `, ; whitespace` and `=`/`:` |
   | `{"temp":23.5,"imu":{"ax":0.1}}` | `json` | nested keys flatten to `imu.ax`; `path`, `timeKey` optional |
   | `>temp:23.5` | `teleplot` | auto-discovered names; `requirePrefix: false` to accept bare `name:value` |
   | `I (1300) sensor: T=23.5C H=41%` | `regex` | JavaScript named groups: `T=(?<temp>[-\\d.]+)C` (double-escape backslashes in JSON) |
   | fixed binary records | `binary` | struct `format` like `<Hhf`, plus `framing` `length` or `startEnd` with `includeMarkers` + `offset` |
3. **Write `dashboards/<id>.json`**: unique `id` (`^[a-z0-9-]+$`, file named `<id>.json`), `name`, `source`, `signals` metadata, `widgets`. Keep `"$schema": "../schema/dashboard.schema.json"` for editor completion.
4. **Add `source.simulate`** so the dashboard runs without hardware: `format` equal to the parser type for csv/kv/json/teleplot with `signals` whose `name`s match the parsed signal names; for `regex` (or any odd format) use `lines` with literal sample output. Match `intervalMs` to the real device rate.
5. **Widgets**: one entry per visual. `signal`/`signals` must be names the parser emits. Use `thresholds` for colour steps (highest step `<=` value wins; below the first step the signal colour is used). Grid is 12 columns, `w` x `h` spans, rows ≈ 90 px. Put a `terminal` (w 12) at the bottom unless the user says otherwise.
6. **Validate**: `pnpm validate:dashboards` (fix every ✖ and look at every ⚠: undeclared signal names usually mean a typo).
7. **Tell the user how to verify**: `pnpm dev`, open `http://localhost:5173/?dashboard=<id>&demo` (auto-starts the simulated device), check each widget moves. Then plug in the board, select the dashboard, click **Connect**, pick the port. Close other programs holding the port (Arduino IDE Serial Monitor, minicom, PlatformIO monitor).
8. If the user's board accepts commands, add a `button` widget with `actions` (`send` text + `lineEnding`).

## Worked example

User: "my board prints `T=23.5 H=41` every 200 ms, show temperature gauge red above 80 and humidity plot".

Parser `kv` emits signals `T` and `H`. The simulate block uses the same names in `kv` format so Demo mode produces identical lines.

```json
{
  "$schema": "../schema/dashboard.schema.json",
  "id": "my-board",
  "name": "My board: temperature & humidity",
  "description": "Prints `T=23.5 H=41` every 200 ms at 115200 baud.",
  "source": {
    "baudRate": 115200,
    "framing": { "mode": "delimiter", "delimiter": "\\n" },
    "parser": { "type": "kv" },
    "simulate": {
      "intervalMs": 200,
      "format": "kv",
      "signals": [
        { "name": "T", "waveform": "sine", "min": 15, "max": 95, "periodMs": 20000, "decimals": 1 },
        { "name": "H", "waveform": "triangle", "min": 30, "max": 70, "periodMs": 15000, "decimals": 0 }
      ]
    }
  },
  "signals": {
    "T": { "label": "Temperature", "unit": "°C", "decimals": 1, "color": "#f97316" },
    "H": { "label": "Humidity", "unit": "%", "decimals": 0, "color": "#38bdf8" }
  },
  "widgets": [
    { "type": "gauge", "signal": "T", "min": 0, "max": 100, "thresholds": [{ "value": 80, "color": "#ef4444" }], "w": 3, "h": 2 },
    { "type": "plot", "title": "Humidity", "signals": ["H"], "w": 9, "h": 2 },
    { "type": "terminal", "w": 12, "h": 3 }
  ],
  "options": { "timeWindowSec": 30 }
}
```

Save as `dashboards/my-board.json`, run `pnpm validate:dashboards`, then open `/?dashboard=my-board&demo`.

## Checks before you finish

- `pnpm validate:dashboards` prints ✔ for the new file with no ⚠.
- `pnpm check` still passes (built-in dashboards are validated at app startup too).
- Signal names in `widgets` exactly match what the parser emits (case-sensitive; kv/regex/json/teleplot names come from the device, csv/binary names from `fields`).
