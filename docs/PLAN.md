# Plan

Goal: an open-source, agent-extensible **Web Serial debug terminal + data-log dashboard**.
An electronics engineer clones the repo, tells Claude/Codex what their device prints, and gets a
custom dashboard that opens in Chrome on a laptop or an Android phone (Chrome 148+), deployable
to GitHub Pages.

## Design principles

1. **Config first.** A dashboard is a JSON file (`dashboards/*.json`) validated by a Zod schema.
   Customisation = editing config. Code changes are only needed for new widget/parser *kinds*.
2. **Framework-free core.** Transport → framing → parsing → signal store → logging is plain
   TypeScript with WHATWG streams and zero DOM dependencies, so it is unit-testable in Node and
   reusable from any UI.
3. **Pluggable everything, explicitly registered.** Widgets, parsers, framers and transports each
   live in one directory and are listed in one registry file an agent can grep.
4. **Works without hardware.** A built-in simulated transport drives every example dashboard, the
   test suite uses a fake `SerialPort`, and the public demo runs on GitHub Pages.
5. **One verification command.** `pnpm check` = typecheck + lint + unit tests + dashboard schema
   validation. CI runs the same string.

## Architecture

```
bytes ──► Transport ──► Framer ──► Parser ──► Sample{name,value,t} ──► SignalStore ──► Widgets
          (serial,       (delimiter,  (csv, kv,                        (ring buffers,   (plot, gauge,
           simulated,     start/end,   json, teleplot,                   subscriptions)   value, led,
           bluetooth*)    length)      regex, binary*)                                     table, terminal)
                                                                        └─► Logger (raw + CSV export)
```
`*` = planned, not in the first release.

### Core data model (`src/core`)
- `Transport`: `open()`, `close()`, `write(bytes)`, `setSignals()`, `onData(cb)`, `onStatus(cb)`.
  `SerialTransport` wraps a `PortLike` (the `SerialPort` subset esptool-js also relies on), so
  WebUSB/Bluetooth/fake ports plug in.
- `Framer`: stateful `push(bytes): Uint8Array[]`.
- `Parser`: `parse(frame, t): Sample[]`. Parsers are pure and table-tested from fixtures.
- `SignalStore`: per-signal typed ring buffers (time + value), `latest()`, `series()`, `subscribe()`.
- `Logger`: raw byte capture + sample log, CSV export via File System Access when available, Blob
  download otherwise.

### Dashboard config (`src/config/schema.ts`)
```
{ "$schema": "../schema/dashboard.schema.json",
  "name": "…",
  "source":  { "baudRate": 115200, "framing": {...}, "parser": {...}, "simulate": {...} },
  "signals": { "temp": { "label": "Temperature", "unit": "°C", "scale": 1 } },
  "widgets": [ { "type": "gauge", "title": "Temp", "signal": "temp", "min": 0, "max": 100,
                 "thresholds": [{ "value": 80, "color": "red" }], "w": 3, "h": 2 } ] }
```
Widgets carry a `w`/`h` grid span (12-column grid); optional `x`/`y` pin a position.

### App shell (`src/app`)
Connect bar (port, baud, DTR/RTS, status, throughput) · dashboard picker (built-in examples,
import/export JSON, remembered in `localStorage`) · widget grid · terminal drawer · record/export.

## Repository layout

```
AGENTS.md  CLAUDE.md  .cursor/rules/  .claude/skills/{customize-dashboard,add-widget,add-parser}
dashboards/            example + user dashboards (JSON)
schema/                generated dashboard.schema.json
src/core/              transport/ framing/ parsers/ store/ logger/
src/config/            zod schema, loader, built-in dashboard index
src/widgets/           one dir per widget + schemas.ts/registry.tsx
src/app/               React shell
src/testing/           FakeSerialPort, fixtures helpers
tests/fixtures/        recorded serial captures
tests/e2e/             Playwright (fake navigator.serial injected)
firmware/              Arduino/ESP-IDF example sketches matching example dashboards
scripts/               new-widget, new-parser, gen-schema, validate-dashboards
docs/                  STUDY, PLAN, ARCHITECTURE, CONFIG, PROTOCOLS, TESTING, DEPLOY
```

## Phases

### Phase 1 (this iteration) — working framework
- [x] Study (docs/STUDY.md)
- [x] Scaffold: Vite 8 + React 19 + TS 5.9 strict + ESLint + Vitest + Playwright, pnpm
- [x] Core: transports (serial, simulated), delimiter/start-end/length framers, parsers
      (csv, key-value, json, teleplot, regex), signal store, logger + CSV export
- [x] Config schema + JSON Schema generation + validator script + 3 example dashboards
- [x] Widgets: terminal, plot, value, gauge, led, table, log, button
- [x] App shell with demo mode, dashboard import/export, PWA manifest
- [x] Tests: unit (fixtures) + e2e (fake serial)
- [x] Agent layer: AGENTS.md, CLAUDE.md, skills, cursor rules, scaffold scripts
- [x] CI + GitHub Pages workflow
- [x] Firmware examples (Arduino CSV + Teleplot)

### Phase 2 — depth
- Binary struct parser (DSL: `<HhfB` style) and CRC options
- OPFS-backed continuous logging in a worker, session replay from a capture file
- Web Bluetooth (NUS) transport; optional `web-serial-polyfill` toggle for old Android
- Oscilloscope widget on WebGL for ≥10 kHz streams; FFT widget
- Slider/number input control widgets; macro buttons; command history in terminal
- Drag-and-drop layout editor that writes back to the JSON config
- Per-widget Playwright screenshot gallery

### Phase 3 — ecosystem
- Publish `@…/core` as an npm package separate from the app
- Dashboard sharing via URL hash / gist
- Device profiles library (`profiles/*.json`) contributed by users
