# Testing

`pnpm check` = `tsc -b` + `eslint .` + `vitest run` + `validate:dashboards`. CI runs the same string. End-to-end tests are separate (`pnpm test:e2e`) because they need a browser.

## Unit tests (Vitest, Node environment)

- Config: `vite.config.ts` → `test.environment: 'node'`, `include: ['src/**/*.test.ts', 'tests/unit/**/*.test.ts']`.
- Why Node: the core uses WHATWG `ReadableStream`/`WritableStream`; jsdom and happy-dom ship broken or missing stream implementations. Keep DOM-free code in `src/core` so it stays testable here.
- Existing suites: `src/core/transport/transport.test.ts`, `src/core/framing/framing.test.ts`, `src/core/parsers/parsers.test.ts`, `src/core/store/store.test.ts`, `src/core/logger/logger.test.ts`.

### FakeSerialPort (`src/testing/fake-serial-port.ts`)

An in-memory `PortLike` that mimics Chrome: `readable`/`writable` are `null` until `open()`, a fresh `ReadableStream` per open.

| Member | Use |
|---|---|
| `feed(text \| bytes)` | Device → app bytes. |
| `written`, `writtenText()` | What the app wrote. |
| `openOptions` | The `SerialOptions` passed to `open()` (assert baud rate etc.). |
| `signals` | Every `setSignals()` call. |
| `injectError(name)` | Error the stream like a recoverable Chrome error (`BufferOverrunError` by default) and provide a fresh stream. |
| `disconnect()` | Error the stream with `NetworkError` and fire the `disconnect` listeners. |

```ts
const port = new FakeSerialPort();
const tr = new SerialTransport(port);
tr.onData((c) => chunks.push(decodeText(c)));
await tr.open({ baudRate: 9600 });
port.feed('a,1\n');
await new Promise((r) => setTimeout(r, 0)); // let the read loop run
```

`SimulatedTransport.tick()` is public so simulated devices can be driven deterministically without timers (or use `vi.useFakeTimers()`).

### Parser table tests

`src/core/parsers/parsers.test.ts` reads a fixture from `tests/fixtures/<name>.txt`, feeds each line through `createParser(config)` with a fixed `t`, and compares `[name, value]` pairs. Add a `describe` block per parser or a `<type>.test.ts` next to the parser (the `new:parser` scaffold creates one).

### Session-level tests

`src/app/session.ts` has no React dependency: `new Session(parseDashboard(json))`, `await session.connect(new SerialTransport(port))`, `port.feed(...)`, then assert on `session.store`, `session.counters` or `session.logger.toCsv()`.

## End-to-end tests (Playwright)

- Config: `playwright.config.ts` — `testDir: tests/e2e`, `baseURL: http://localhost:4173`, `webServer: pnpm vite preview --port 4173` (serves `dist/`, so run `pnpm build` first), `channel: process.env.PW_CHANNEL ?? 'chrome'`.
- Browser: by default the locally installed Google Chrome is used (no download). Alternatives: `PW_CHANNEL=msedge`, or `pnpm exec playwright install chromium` then `PW_CHANNEL=chromium pnpm test:e2e`.
- Specs: `tests/e2e/dashboard.spec.ts` covers connect/parse/widgets, button sends, record + CSV export, device loss + reconnect, `?demo` mode, dashboard switching.
- CI (`.github/workflows/ci.yml`): job `check` runs `pnpm check` + `pnpm build`; job `e2e` installs Playwright's Chromium (`pnpm exec playwright install --with-deps chromium`), builds, runs `pnpm test:e2e` with `PW_CHANNEL=chromium` and uploads `playwright-report/` on failure.

### Injected fake serial (`tests/e2e/fake-serial.ts`)

`installFakeSerial()` is serialised with `Function.toString()` and run via `page.addInitScript` before the app loads, so it must stay self-contained (no imports or outer references). It defines `navigator.serial` with `requestPort()`/`getPorts()` resolving to one in-memory port and exposes `window.__fakeSerial`:

| Method | Use |
|---|---|
| `feed(text)` | Push bytes to the app (split across calls to test partial frames). |
| `written()` | Concatenated text the app sent. |
| `opened()` | Number of `open()` calls. |
| `options()` | Last `open()` options (`baudRate`…). |
| `disconnect()` | Simulate cable pull. |

Pattern:

```ts
await page.addInitScript(`(${installFakeSerial.toString()})()`);
await page.goto('/?dashboard=demo-sensor');
await page.getByTestId('connect').click();
await expect(page.getByTestId('status')).toContainText('connected');
await page.evaluate(() => window.__fakeSerial.feed('85.5,41,3.91,1\n'));
await expect(page.getByTestId('gauge-temp')).toHaveText('85.5 °C');
```

Test ids available: `dashboard-select`, `status`, `connect`, `demo`, `disconnect`, `rx-bytes`, `signal-count`, `rec-start`, `rec-stop`, `gauge-<signal>`, `value-<signal>`, `led-<signal>`, `table-<signal>`; widgets also carry `data-widget="<type>"`, `data-widget-id`, `data-signal`.

## Manual testing with real hardware

1. Flash one of the sketches in `firmware/arduino/` (CSV, Teleplot, ESP-log style) or your own firmware.
2. `pnpm dev`, open `http://localhost:5173/?dashboard=<id>`, click **Connect**, pick the port. Close any other program holding it (Arduino IDE Serial Monitor, PlatformIO monitor, esptool).
3. Use **Reset board** (DTR/RTS pulse) for boards that reset on open; toggle DTR/RTS if an ESP32 stays in the bootloader.
4. Check the status bar: RX bytes growing → transport OK; frames/s > 0 → framing OK; signals > 0 → parser OK.
5. Android: install the PWA or open the Pages URL in Chrome 148+ with an OTG cable (docs/DEPLOY.md).

## Linux virtual serial ports (hardware-free manual tests)

Chrome enumerates ports through udev and only lists `tty` devices whose driver type is `serial`. **`socat -d -d pty,raw,echo=0 pty,raw,echo=0` creates `/dev/pts/*` pseudo-terminals, which never appear in the chooser.** Use a kernel module instead:

| Module | Devices | Notes |
|---|---|---|
| [serialsim](https://github.com/cminyard/serialsim) | `/dev/ttyEcho0` (loopback), `/dev/ttyPipeA0` ↔ `/dev/ttyPipeB0` | `sudo modprobe serialsim`; write to `PipeA0` with `python -m serial.tools.miniterm`/`cat`, pick `PipeB0` in Chrome. Supports modem-control signals. |
| [tty0tty](https://github.com/freemed/tty0tty) | `/dev/tnt0` ↔ `/dev/tnt1` … `tnt7` | DKMS build; pairs are cross-connected. |

Feed data: `while true; do echo "23.5,41,3.70,0" > /dev/ttyPipeA0; sleep 0.1; done` or replay a capture with `pv -L 1k capture.raw.txt > /dev/ttyPipeA0`. Add yourself to `dialout` (or `chmod` the device) first. Snap-packaged Chromium cannot see these ports; use the `.deb` Chrome.

For automated tests do not go through the OS at all: inject the fake `navigator.serial` as the e2e suite does.

## Turning captures into fixtures

1. Connect to the real device, click **Record**, let it run, click **Export raw** (saves `<id>-<timestamp>.raw.txt`, the exact RX bytes).
2. Text protocols: copy a handful of representative lines (including a malformed one) into `tests/fixtures/<name>.txt` and reference it from a parser test with the `fixture()` helper. The same lines can go into `simulate.lines` so Demo mode replays real output.
3. Binary protocols: keep the capture as bytes and load it with `readFileSync` into a `Uint8Array`; push it through `createFramer(...)` then `createParser(...)` in the test.
4. **Export CSV** gives the parsed samples (wide format, one row per parsed frame) for checking scaling and signal names offline.
