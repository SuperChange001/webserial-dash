# Study: Web Serial open-source landscape (Oct 2026)

This document records the research done before designing this framework.
It is a snapshot; facts marked *(unverified)* were not confirmed from a primary source.

## 1. Reference implementations we read

### esptool-js (Espressif, Apache-2.0)
- Library/demo split: `src/` compiled by `tsc` to `lib/` plus a Rollup `bundle.js`; the demo in
  `examples/typescript` is its own npm project (Parcel) consuming `../../lib`.
- **The library never calls `navigator.serial.requestPort()`.** `Transport` takes an already
  selected `SerialPort`-shaped object. The demo decides between native Web Serial,
  `web-serial-polyfill` (WebUSB) and a hand-written CH340 WebUSB adapter exposing
  `asSerialPort()`. The adapter contract is `readable/writable/open/close/getInfo/setSignals`
  plus optional `setBaudRate` (`BaudRateConfigurablePort`).
- Reading: one long-lived reader stored on the instance so `disconnect()` can `cancel()` it;
  `BufferOverrunError/FramingError/ParityError` are treated as recoverable; `DOMException` means
  device lost. Writing: `getWriter()` → `write()` → `releaseLock()` per call. `waitForUnlock()`
  before `close()`.
- Reset strategies are small classes driving DTR/RTS (`ClassicReset`, `HardReset`, and a
  `CustomReset` string DSL `"D0|R1|W100|..."`). Terminal is an interface (`clean/write/writeLine`).
- GitHub Pages: `.github/workflows/pages.yml` builds the demo and uses
  `actions/upload-pages-artifact` + `actions/deploy-pages` (OIDC). No `gh-pages` branch.

### esp-web-tools (ESPHome, Apache-2.0)
- Lit web components. Console reader is a pure Streams pipeline:
  `port.readable.pipeThrough(TextDecoderStream).pipeThrough(LineBreakTransformer)
  .pipeThrough(TimestampTransformer).pipeTo(sink)` cancelled with an `AbortController`.
- Exactly one owner of the port at a time (improv client → console → flasher).

### GoogleChromeLabs/serial-terminal (Apache-2.0)
- Vite 8 + `@xterm/xterm` 6 + `vite-plugin-pwa` + `web-serial-polyfill` (chosen with `?polyfill`
  URL param). BYOB reader with 8 kB buffer, `term.write(chunk, cb)` awaited for backpressure.
  Break via `setSignals({break:true})`. No settings persistence.

## 2. Ecosystem survey

| Project | License | Stack | Takeaway |
|---|---|---|---|
| [Teleplot](https://github.com/nesnes/teleplot) | MIT | Vue 2 + uPlot | Zero-schema line protocol `>name:value§unit\|flags`; auto-discovered series; layout JSON export |
| [Serial Studio](https://github.com/Serial-Studio/Serial-Studio) | GPL-3 (+Pro) | Qt/QML desktop | Best reference DSL: `.ssproj` = sources (frame detection/decoder/JS parser) → groups → datasets (index, units, widget, min/max, alarm) |
| [atomic14/web-serial-plotter](https://github.com/atomic14/web-serial-plotter) | GPL-3 | Vite+React, custom canvas | Ring buffer store, `# a b c` CSV header convention, built with Claude |
| [OpenSerial-Studio](https://github.com/ptai-eng/OpenSerial-Studio) | MIT | React+Recharts PWA | One JSON object per line → auto widgets; Recharts (SVG) does not scale |
| [SerialCanvas](https://github.com/ra9fael/SerialCanvas) | AGPL-3 | single HTML | Text-rule parser templates, hex-frame schema, raw byte recorder with replay |
| [lewuq/Web-Serial-Monitor](https://github.com/lewuq/Web-Serial-Monitor) | MIT | Next.js | Auto-detects numeric fields in CSV / `k=v` / nested JSON |
| [SparkFun_WebSerialPlotter](https://github.com/sparkfun/SparkFun_WebSerialPlotter), [serialviz](https://github.com/skybrian/serialviz), [Spacehuhn terminal](https://github.com/SpacehuhnTech/serialterminal) | MIT/Apache | vanilla | Simple plotters/terminals |

**Gap:** no project drives a dashboard from a *declarative config file* over Web Serial in the
browser. Serial Studio does it on desktop; Teleplot has auto-layout only. That gap is what this
repo fills, and a config file is also the ideal surface for an AI agent to edit.

## 3. Platform facts

- Web Serial: Chrome/Edge 89+, Opera 76+ on desktop. **Android Chrome: Bluetooth RFCOMM ports
  since 138, USB serial since Chrome 148 (Apr 2026)** ([chromestatus](https://chromestatus.com/feature/6043992171085824)).
  Firefox 151+ ships it behind a site-permission add-on model *(gating UX unverified)*. Safari: none.
- [google/web-serial-polyfill](https://github.com/google/web-serial-polyfill) (WebUSB → Serial
  shape) is **archived (Jan 2025)**, CDC-ACM only, no CP210x/CH340/FTDI. We keep it as an optional
  fallback for Android < 148 but do not build on it.
- Web Bluetooth (Nordic UART Service) is the other mobile-friendly transport; planned as a
  second `Transport` implementation.
- Secure context required (HTTPS or localhost; `file://` fails). GitHub Pages is fine.
  `requestPort()` needs a user gesture; `getPorts()` returns already granted ports; `forget()` revokes.
- `open()` defaults: 8N1, `bufferSize` 255. Raise `bufferSize` for high rates.
- Linux: Chrome enumerates via udev and only lists `tty` devices whose driver type is `serial`.
  **socat pseudo-terminals (`/dev/pts/*`) never appear** in the chooser. For hardware-free manual
  testing use the `serialsim` or `tty0tty` kernel modules; for automation inject a fake
  `navigator.serial`. Snap Chromium hides USB ports; use the `.deb` Chrome. `brltty` hijacks
  CH340 adapters on Ubuntu. Windows: CH341SER driver 3.8+ breaks `open()`.
- Installed PWAs keep the same permission model as the tab; Web Serial works in them.

## 4. Library choices

| Concern | Choice | Why |
|---|---|---|
| Plot | **uPlot** (MIT, ~48 kB) | 166k points in 25 ms, built-in downsampling, used by Teleplot and Grafana. WebGL (`TimeChart`/`webgl-plot`) reserved for a future ≥10 kHz oscilloscope widget |
| Terminal | **@xterm/xterm 6** + fit addon | Standard; WebGL addon optional |
| Config validation | **zod 4** → exported JSON Schema | One source of truth; editors and agents get completion |
| Storage | in-memory ring buffers now; OPFS sync-access-handle worker for long logs later | OPFS works on Android; `showSaveFilePicker` is desktop-only |
| UI | React 19 + TypeScript | Highest agent fluency; data path is framework-free so UI could be swapped |
| Build/test | Vite 8, Vitest (node env for stream code), Playwright with injected fake serial | jsdom/happy-dom break WHATWG streams |

## 5. Agent-friendly repo conventions (what we adopted)

- `AGENTS.md` is the canonical instruction file (Codex, Cursor, Copilot, Gemini CLI read it);
  `CLAUDE.md` just imports it. Keep it short and imperative; point to docs instead of inlining.
- Claude Code skills under `.claude/skills/*/SKILL.md` encode golden paths
  ("customize dashboard", "add widget", "add parser").
- Config-first: a one-line user request ("show `temp` as a gauge, red above 80") becomes a diff to
  `dashboards/*.json`, not code.
- Explicit registries (one directory per widget/parser), scaffold scripts, a single `pnpm check`
  that CI runs verbatim, fixture-driven parser tests with recorded captures.
