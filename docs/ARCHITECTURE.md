# Architecture

WebSerial Dash is a static single-page app. All code runs in the browser; there is no backend. The data path is framework-free TypeScript (`src/core`), the shell is React (`src/app`), and everything the user customises is JSON (`dashboards/`).

## Data flow

```
                       src/core/transport            src/core/framing        src/core/parsers
 SerialPort ──bytes──► Transport.onData(chunk) ──► Framer.push(chunk) ──► Parser.parse(frame, t)
 (Web Serial,          SerialTransport               DelimiterFramer         csv kv json teleplot
  FakeSerialPort)      SimulatedTransport            StartEndFramer          regex binary
                            │                        LengthFramer                  │
                            │ status events                                        │ Sample[] {name,value,t}
                            ▼                                                      ▼
                   src/app/session.ts  Session ── scale/offset (signals meta) ──► SignalStore (src/core/store)
                     counters, raw/frame emitters,                                 per-signal RingBuffer
                     send()/sendBytes(), setSignals()                              latest() series() getStats()
                            │                                                      │
                            ├──► SessionLogger (src/core/logger): raw rx/tx + samples → CSV / raw export
                            │
                            ▼                                                      ▼
                   React shell (src/app): ConnectBar, DashboardGrid, StatusBar ◄── widgets poll the store
                                                                                   (src/widgets/*, WidgetContext)
 Dashboard JSON (dashboards/*.json) ──► zod dashboardSchema (src/config/schema.ts) ──► Dashboard object
                                         └──► pnpm gen:schema ──► schema/dashboard.schema.json
```

## Layers and interfaces

| Layer | Files | Interface |
|---|---|---|
| Bytes helpers | `src/core/bytes.ts` | `encodeText`, `decodeText`, `unescapeString` (`\n \r \t \0 \xNN \\`), `hexToBytes`, `bytesToHex`, `concatBytes`, `indexOfBytes` |
| Events | `src/core/emitter.ts` | `Emitter<T>`: `on(listener) → Unsubscribe`, `emit(value)`, `size`, `clear()` |
| Transport | `src/core/transport/types.ts` | `Transport { kind, label, status, open(OpenOptions), close(), write(Uint8Array), setSignals?(OutputSignals), onData(cb), onStatus(cb) }`; `TransportStatus = closed/opening/open/closing/error` |
| Port abstraction | `src/core/transport/types.ts` | `PortLike`: the `SerialPort` subset (`readable`, `writable`, `open`, `close`, `getInfo`, optional `setSignals/forget/addEventListener`). Real ports, `FakeSerialPort` and future WebUSB/Bluetooth adapters implement it. |
| Serial transport | `src/core/transport/serial-transport.ts` | One long-lived reader per open; `BufferOverrunError/FramingError/ParityError/BreakError` re-acquire the reader; other errors → `error` status and `port.close()`. Writer locked per `write()`. Listens to the port `disconnect` event. |
| Simulated transport | `src/core/transport/simulated-transport.ts` | `SimulatedTransport(spec, label?, now?)` driven by `setInterval(spec.intervalMs)`; `tick()` public for tests; generates `csv/kv/json/teleplot` lines from waveforms or replays `spec.lines`; echoes writes as `echo: …` when `spec.echo`. |
| Framing | `src/core/framing/` | `Framer { push(chunk): Uint8Array[]; reset() }`; `createFramer(FramingConfig)` switch over `delimiter` / `startEnd` / `length`. Marker strings are unescaped here. |
| Parsing | `src/core/parsers/` | `Parser { parse(frame, t): Sample[]; reset?() }`; `ParserDefinition { type, description, schema, create(config) }`; `registry.ts` lists definitions and builds the `parserSchema` discriminated union; `createParser(config)` validates config with the plugin's own schema. |
| Store | `src/core/store/` | `RingBuffer(capacity)` two `Float64Array`s (`push`, `last`, `toArrays(since?)` with binary search); `SignalStore(capacity)` map name → buffer plus running stats, `push(samples)` emits the set of changed names; `latest`, `series(name, since)`, `getStats`, `names`, `clear`. Non-finite values are dropped. |
| Logger | `src/core/logger/` | `SessionLogger({maxRawBytes 8 MiB, maxSamples 1e6})`: `start/stop/clear`, `addRaw(bytes, dir, t)`, `addSamples`, `toCsv()` (wide: one row per parsed frame), `rawToBytes(dir)`, `rawChunks()`. `saveBlob()` uses `showSaveFilePicker` when present, `<a download>` otherwise. |
| Config | `src/config/schema.ts` | `dashboardSchema` (zod 4) composed from `sourceSchema`, `framingSchema`, `parserSchema`, `simulateSchema`, `signalMetaSchema`, `widgetSchema`. `parseDashboard`, `safeParseDashboard`, `formatIssues`. `src/config/dashboards.ts`: built-ins via `import.meta.glob('../../dashboards/*.json')`, user imports in `localStorage` (`wsd.userDashboards`, `wsd.lastDashboard`). |
| Session | `src/app/session.ts` | `Session(dashboard)`: owns `store`, `logger`, `transport`, `status`, `error`, `counters {rxBytes, txBytes, frames, samples}`, output `signals` (DTR/RTS on by default). `connect(transport)`, `disconnect()`, `setDashboard()`, `send(text, lineEnding)`, `sendBytes()`, `setSignals()`, `resetDevice()` (DTR/RTS pulse), `clearData()`. Emitters: `raw` (rx/tx bytes), `frame` (text + samples per frame, only emitted when someone listens), `changed` (status/counters). |
| Widgets | `src/widgets/types.ts` | `WidgetContext { session, dashboard, meta(), label(), format(), color() }` built by `src/app/widget-context.ts` (10-colour palette, decimals from meta or 0/2); `WidgetProps<C> { config, ctx }`; `WidgetDefinition { type, description, component }`. Schemas in `schemas.ts` (React-free), components in `registry.tsx`. |
| Shell | `src/app/` | `App.tsx` (dashboard picker, import/export JSON, `?dashboard=<id>` and `?demo` URL params), `ConnectBar.tsx` (`navigator.serial.requestPort`, baud select, DTR/RTS, Reset board, Demo), `DashboardGrid.tsx` (CSS grid, auto layout when `widgets` is empty), `StatusBar.tsx` (rates, record/export/clear), `hooks.ts` (`useSessionChanged`, `useTick`, `useLatest`, `useElementSize`). |

## Threading and scheduling

- Everything runs on the **main thread**; there are no workers yet (an OPFS logging worker is on the roadmap, `docs/PLAN.md`).
- `SerialTransport.readLoop()` is an async loop awaiting `reader.read()`; each resolved chunk is handed synchronously to `Session.handleData`, which frames, parses, scales, updates counters, pushes to the store and logger, and emits `raw`/`frame` events. All samples from one chunk share one `Date.now()` timestamp.
- The store does not push to React. Widgets choose their cadence:
  - `plot`: rebuilds uPlot data from `store.series(name, now - window)` once per `requestAnimationFrame`, `setData(..., false)` + `setScale('x')`.
  - `value`, `gauge`, `led`: `useLatest()` → `useTick(10)` (10 Hz `setInterval`).
  - `table`: `useTick(5)`. `StatusBar`: `useTick(2)` plus a 1 s rate sampler. `DashboardGrid` in auto-layout mode re-evaluates discovered signal names at 1 Hz.
  - `log`: subscribes to `session.frame`, buffers lines in a ref and flushes to state every 100 ms (paused state stops flushing).
  - `terminal`: writes `session.raw` rx bytes straight into xterm.js; keystrokes go to `session.sendBytes`.
- Decoupling the parse rate from the render rate keeps kHz-rate streams cheap; the store holds `options.bufferSamples` (default 20 000) samples per signal in typed arrays.
- `?demo` and the Demo button build a `SimulatedTransport` from `source.simulate` (line ending unescaped in the shell), so demo, e2e tests and real hardware share the exact same pipeline from `Transport` onward.

## Extension points

| To add | Where | Registry |
|---|---|---|
| Dashboard | `dashboards/<id>.json` | auto-discovered by `import.meta.glob`; validated by `scripts/validate-dashboards.ts` |
| Widget kind | `src/widgets/<type>/` (`pnpm new:widget`) | `src/widgets/schemas.ts` **and** `src/widgets/registry.tsx` |
| Parser kind | `src/core/parsers/<type>/` (`pnpm new:parser`) | `src/core/parsers/registry.ts` |
| Framer mode | `src/core/framing/<mode>-framer.ts` | `createFramer` switch in `src/core/framing/index.ts` + `framingSchema` in `src/config/schema.ts` + `FramingConfig` in `src/core/framing/types.ts` (no registry object) |
| Transport | `src/core/transport/<kind>-transport.ts` implementing `Transport` | no registry; `ConnectBar.tsx` hard-codes serial + simulated, add a button there. A WebUSB/Bluetooth bridge can instead implement `PortLike` and reuse `SerialTransport`. |
| Export format | `src/core/logger/session-logger.ts` | called from `StatusBar.tsx` |

## Design constraints

- `src/core/**` has no DOM or React imports so it runs under Vitest in `environment: 'node'` and in tsx scripts (`gen-schema`, `validate-dashboards`).
- Widget `schema.ts` files are imported by those scripts too; keep them React-free.
- Zod schemas are the single source of truth: TypeScript types (`z.infer`), runtime validation, and the exported JSON Schema all derive from them.
