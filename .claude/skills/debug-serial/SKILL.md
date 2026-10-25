---
name: debug-serial
description: Diagnose "no data", "Connect does nothing", "port not listed", "Failed to open serial port", garbage characters or widgets stuck at "—" in WebSerial Dash. Walks through browser support, secure context, port ownership, OS driver issues (Linux dialout/brltty, Windows CH341, macOS), baud and framing mismatches, chrome://device-log, Export raw and Demo mode to split UI problems from hardware problems.
---

# Debug a serial connection

Work top-down; stop at the first failing step. Ask the user for OS, browser version, adapter chip (CH340, CP210x, FTDI, native USB) and the exact error text shown next to the Connect button.

## 1. Is it the app or the hardware? Use Demo mode

- Open `/?dashboard=<id>&demo` (or click **Demo**). If widgets move, the dashboard/parser/UI are fine and the problem is the port or the device output. If not, it is a config problem: run `pnpm validate:dashboards` and check the browser console for `Invalid dashboard` errors.

## 2. Browser support (Connect button disabled, blue banner "no Web Serial API")

| Works | Does not |
|---|---|
| Chrome / Edge / Opera on Windows, macOS, Linux, ChromeOS | Firefox (needs the site-permission add-on model, unverified), Safari (none) |
| Android Chrome 148+ for USB (OTG cable); Bluetooth RFCOMM since Chrome 138 | Older Android Chrome, iOS |
| Installed PWA (same permissions as the tab) | Snap-packaged Chromium on Ubuntu hides USB ports; use the `.deb` Chrome |

- The page must be a **secure context**: `https://` or `http://localhost`. `file://` and `http://<lan-ip>` do not expose `navigator.serial`. For LAN testing use HTTPS (tunnel or local cert) or `chrome://flags/#unsafely-treat-insecure-origin-as-secure`.
- `requestPort()` needs a user gesture; only the Connect button can open the chooser.

## 3. Port not in the chooser

- Linux: Chrome lists only udev devices whose driver type is `serial`; `socat` pseudo-terminals (`/dev/pts/*`) never show. Use `serialsim`/`tty0tty` for virtual ports (docs/TESTING.md).
- Linux permissions: `sudo usermod -aG dialout $USER` (then log out/in); `ls -l /dev/ttyUSB* /dev/ttyACM*`.
- Linux CH340 disappears after a second: `brltty` claims it. `sudo apt remove brltty` (or add a udev rule to ignore it).
- Windows CH340/CH341: driver 3.8+ can make `open()` fail; install the 3.5 driver or the Windows Update one. Check Device Manager for the COM number.
- macOS: look for `/dev/cu.usbserial-*`/`cu.usbmodem*`; older macOS needs vendor CP210x/FTDI drivers.
- Native-USB boards (ESP32-S3/C3, RP2040, SAMD) enumerate only after firmware starts USB-CDC; press reset.
- `source.filters` (VID/PID) in the dashboard hides every non-matching port; remove the filter to see all ports.

## 4. Open fails ("Failed to open serial port", `NetworkError`, `InvalidStateError`)

- Another program owns the port: Arduino IDE Serial Monitor/Plotter, PlatformIO monitor, esptool, minicom, screen, ModemManager (Linux: `sudo systemctl stop ModemManager` or wait 20 s after plug-in), another browser tab. Only one owner at a time.
- Unplug/replug, then click **Disconnect** followed by **Connect**; a port left in `error` state (red pill) needs Disconnect first.
- Inspect `chrome://device-log` (filter: Serial) for the OS-level error.

## 5. Connected but nothing happens (RX stays at 0 B)

- Baud mismatch: the **Baud** select in the top bar overrides `source.baudRate` until you switch dashboards. Match `Serial.begin(...)`.
- Boards that reset on DTR (Arduino Uno/Nano, ESP32 dev kits): wait 1–2 s after Connect; use **Reset board** to pulse DTR/RTS. Some ESP32 boards stay in bootloader if DTR/RTS are asserted the wrong way: toggle the DTR/RTS checkboxes.
- Firmware only prints on request: send a command from the terminal widget.
- Wrong `dataBits`/`parity`/`stopBits` in `source` (rare; default 8N1).

## 6. RX grows but widgets show "—" (0 signals in the status bar)

- Framing: default delimiter is `\n` (a trailing `\r` is stripped). Devices ending lines with bare `\r` need `"framing": {"mode":"delimiter","delimiter":"\\r"}`. Binary protocols need `startEnd` or `length` framing.
- Parser mismatch: compare a raw line with the parser (docs/PROTOCOLS.md). Common cases: `teleplot` drops lines without `>` (`requirePrefix: false`); `csv` with a different separator (`" "` for whitespace) or a reply line that starts with `#`; `kv` key names are case-sensitive; `regex` needs *named* groups `(?<name>…)` and double-escaped backslashes in JSON; `json` needs one object per line.
- Signal names in widgets must equal the emitted names. `frames/s > 0` and `N signals > 0` in the status bar means parsing works and the widget names are wrong; a `table` widget with empty `signals` lists everything the parser emits.
- Garbage characters (`ÿ`, `�`, boxes): baud mismatch or a 3.3 V / 5 V level problem.
- Use **Record** → **Export raw** in the status bar to save the exact bytes received, then inspect them in a hex editor, or paste the lines into `simulate.lines` / a parser test to reproduce offline.

## 7. Data stops after a while / drops

- Raise `source.bufferSize` (default 65536) for high rates; `BufferOverrunError`/`FramingError`/`ParityError` are retried automatically, a `NetworkError` means the device vanished (cable, brown-out, reset).
- Keep the tab in the foreground on Android; background tabs throttle timers.

## 8. Collect a report

OS + browser version, adapter chip, `chrome://device-log` lines, the dashboard JSON, one **Export raw** capture, and whether Demo mode works. That is enough to reproduce in a unit test with `FakeSerialPort.feed(bytes)`.
