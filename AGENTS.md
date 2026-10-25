# AGENTS.md — WebSerial Dash

Agent-extensible Web Serial debug terminal + data-log dashboard: a static web app (Vite 8, React 19, TypeScript 5.9 strict, zod 4, uPlot, xterm.js) that runs in Chrome/Edge on desktop and Android Chrome 148+, and deploys to GitHub Pages.
Bytes flow `Transport → Framer → Parser → Sample{name,value,t} → SignalStore → widgets`; the dashboard is a JSON file validated by a Zod schema.

## Golden rule

Customise via `dashboards/*.json` first. "Show `temp` as a gauge, red above 80" is a JSON diff, not code.
Touch `src/` only to add a new **widget kind** or **parser kind** (or fix a bug). Never hand-edit `schema/dashboard.schema.json`; it is generated.

## Commands (pnpm, Node >= 20)

| Command | Purpose |
|---|---|
| `pnpm dev` | Vite dev server; open `http://localhost:5173/?dashboard=<id>&demo` |
| `pnpm check` | typecheck + lint + unit tests + dashboard validation. **Must pass before you finish.** CI runs the same string. |
| `pnpm test` / `pnpm test:watch` | Vitest unit tests (Node environment) |
| `pnpm test:e2e` | Playwright against `vite preview` (run `pnpm build` first; uses local Chrome, override with `PW_CHANNEL`) |
| `pnpm gen:schema` | Regenerate `schema/dashboard.schema.json` from `src/config/schema.ts` (also run by `pnpm build`) |
| `pnpm validate:dashboards` | Validate every `dashboards/*.json`, warn on undeclared signals and simulate/parser mismatch |
| `pnpm new:widget <type>` | Scaffold `src/widgets/<type>/{schema.ts,<Type>.tsx}` |
| `pnpm new:parser <type>` | Scaffold `src/core/parsers/<type>/{index.ts,<type>.test.ts}` |

## Repo map

| Path | Contents |
|---|---|
| `dashboards/` | Example + user dashboards (JSON). Built-ins are loaded with `import.meta.glob` at startup. |
| `schema/` | Generated JSON Schema (`$schema` target for editor completion). |
| `src/core/` | DOM-free data path: `transport/`, `framing/`, `parsers/`, `store/`, `logger/`, `bytes.ts`, `emitter.ts`. |
| `src/config/` | `schema.ts` (Zod source of truth), `dashboards.ts` (built-in index, localStorage import/export). |
| `src/widgets/` | One dir per widget (`schema.ts` + component), `base-schema.ts`, `schemas.ts`, `registry.tsx`, `types.ts`. |
| `src/app/` | React shell: `App.tsx`, `session.ts` (wires the pipeline), `ConnectBar.tsx`, `DashboardGrid.tsx`, `StatusBar.tsx`, `hooks.ts`, `widget-context.ts`, `styles.css`. |
| `src/testing/` | `FakeSerialPort` (in-memory `PortLike`) for unit tests. |
| `tests/e2e/` | Playwright specs + `fake-serial.ts` (injected `navigator.serial`). |
| `tests/fixtures/` | Recorded device output used by parser tests. |
| `scripts/` | `gen-schema`, `validate-dashboards`, `new-widget`, `new-parser` (run with tsx). |
| `firmware/` | Arduino sketches matching the example dashboards. |
| `docs/` | STUDY, PLAN, ARCHITECTURE, CONFIG, PROTOCOLS, TESTING, DEPLOY. |
| `.github/workflows/` | `ci.yml` (`pnpm check` + build + Playwright e2e), `pages.yml` (GitHub Pages deploy with `BASE_PATH`). |

## How to add a dashboard

1. Copy the closest example: `quickstart.json` = kv, no widgets (auto layout); `wifi-speedtest.json` = kv + device ticks + gauges with min/max + per-test history + local/remote buttons + scripted demo replies; `demo-sensor.json` = CSV; `esp-log.json` = regex over logs; `teleplot.json` = Teleplot. Full worked example with prompts and diffs: `docs/CUSTOMIZE.md`.
   **When you write or suggest firmware, default to `kv` lines plus a tick counter** (`ticks=%lu temp=%.1f\n` with `millis()`) and add `source.timestamp`. Use CSV-with-`fields`, regex or binary only for firmware the user cannot change or for very high rates.
2. Set a unique `id` (`^[a-z0-9-]+$`); the file must be named `<id>.json`.
3. Pick `source.framing` (default: newline-delimited, CR stripped) and `source.parser` (`csv`, `kv`, `json`, `teleplot`, `regex`, `binary`).
4. Fill `source.simulate` so Demo mode and `?demo` work without hardware: `format` must match the parser (`csv`/`kv`/`json`/`teleplot`) or use `lines` to replay literal output (regex, log-style devices). Binary parsers cannot be simulated.
5. Add `signals` metadata (label, unit, decimals, scale/offset, color) and `widgets`.
6. Buttons: `send` talks to the device; `local` (`clearData`, `resetDevice`, `recordStart`, `recordStop`) is handled by the page. If the device answers commands, add `simulate.responses` so Demo mode answers too.
7. `pnpm validate:dashboards`, then `pnpm dev` and open `/?dashboard=<id>&demo`. Only then connect real hardware.
Full reference: `docs/CONFIG.md`. Line formats and firmware snippets: `docs/PROTOCOLS.md`.

## How to add a widget

1. `pnpm new:widget <type>` (lowercase identifier).
2. Edit `src/widgets/<type>/schema.ts` (extend `widgetBase`, `.describe()` every field, set `w`/`h` defaults) and `<Type>.tsx` (use `useLatest`/`useTick` from `src/app/hooks.ts`, `ctx.format/label/color`, CSS classes `w-<type>` in `src/app/styles.css`, a `data-testid`).
3. Register in **both** `src/widgets/schemas.ts` (`widgetSchemas` + `widgetSchema` union) **and** `src/widgets/registry.tsx` (`widgetRegistry`).
4. `pnpm gen:schema`, add a test (unit for pure logic, e2e in `tests/e2e/dashboard.spec.ts` for rendering), document in `docs/CONFIG.md`, `pnpm check`.

## How to add a parser

1. `pnpm new:parser <type>`.
2. Implement `ParserDefinition` in `src/core/parsers/<type>/index.ts`: Zod `schema` with `type: z.literal('<type>')`, `create(config)` returning `{ parse(frame, t): Sample[], reset?() }`. Emit raw numbers; `signals.<name>.scale/offset` are applied by `Session`.
3. Register in `src/core/parsers/registry.ts` (import, append to `parserDefinitions` and `parserSchema`).
4. Add a recorded capture to `tests/fixtures/` and a table test following `src/core/parsers/parsers.test.ts`; document in `docs/PROTOCOLS.md`; `pnpm gen:schema && pnpm check`.

## Conventions

- Strict TypeScript (`noUncheckedIndexedAccess`, `verbatimModuleSyntax`); no `any`; `import type` for types; unused args prefixed `_`.
- Every Zod field has `.describe()`; defaults live in the schema (`.default()`), not in components. Use `.prefault({})` for object-valued defaults so nested defaults are filled.
- Schema files (`src/widgets/**/schema.ts`, `src/widgets/schemas.ts`, `src/core/**`) must not import React or touch the DOM: scripts load them under Node.
- `src/core` stays framework-free and DOM-free (WHATWG streams, `TextEncoder`, timers only). The React layer lives in `src/app` and widget components.
- Widgets read the store directly through `ctx.session.store` and re-render on their own schedule; no prop drilling, no global state library.
- Unit tests run in the Node environment (`vitest`, `src/**/*.test.ts`) with `FakeSerialPort`; browser behaviour is covered by Playwright with the injected fake `navigator.serial`.
- Keep strings in JSON escaped (`"\\n"`, `"\\x02"`); `unescapeString` interprets them at runtime.

## Common pitfalls

- socat/`/dev/pts` pseudo-terminals never appear in Chrome's port chooser; use `serialsim`/`tty0tty` or Demo mode (docs/TESTING.md).
- jsdom/happy-dom break WHATWG streams; keep `test.environment: 'node'`.
- The teleplot parser drops lines without a leading `>` unless `requirePrefix: false`.
- The csv parser treats a non-numeric line as a header only when it starts with `#` or when `fields` is empty; a `#`-prefixed line renames columns even when `fields` is set.
- zod 4: `.default({})` on an object does not fill nested defaults; use `.prefault({})` (see `dashboardSchema.source`/`options`).
- A widget registered in only one of `schemas.ts` / `registry.tsx` fails typecheck (`widgetRegistry` is keyed by `WidgetType`), so run `pnpm typecheck` early.
- `?demo` auto-connects only when the dashboard has `source.simulate`; the Demo button falls back to a single sine signal named `demo`.
- Delimiter escapes: `"\\r\\n"` in JSON becomes CRLF; the default `"\\n"` framer already strips a trailing CR.

## Pointers

`docs/ARCHITECTURE.md` (data flow, interfaces, extension points) · `docs/CONFIG.md` (JSON reference) · `docs/PROTOCOLS.md` (line formats + firmware) · `docs/TESTING.md` · `docs/DEPLOY.md` · `docs/PLAN.md` (roadmap) · `docs/STUDY.md` (prior art).
Claude Code skills with step-by-step procedures: `.claude/skills/{customize-dashboard,add-widget,add-parser,debug-serial}/SKILL.md`.
