---
name: add-widget
description: Add a new widget kind (e.g. sparkline, bar, histogram, slider, numeric input, map, compass) to WebSerial Dash — scaffold src/widgets/<type>, write its Zod schema and React component, register it in both src/widgets/schemas.ts and src/widgets/registry.tsx, regenerate the JSON schema, style it and test it. Use only when no existing widget type (plot, value, gauge, led, table, terminal, log, button) can do the job via dashboards/*.json.
---

# Add a widget kind

Check first that `plot`, `value`, `gauge`, `led`, `table`, `terminal`, `log` or `button` cannot do it with config (`docs/CONFIG.md`). A new widget is TypeScript in `src/widgets/<type>/`.

## Procedure

1. **Scaffold**: `pnpm new:widget <type>` (lowercase letters/digits). Creates `src/widgets/<type>/schema.ts` and `src/widgets/<type>/<Type>.tsx` and prints the two registry lines.
2. **Schema** (`schema.ts`, React-free; Node scripts import it):
   - `widgetBase.extend({ type: z.literal('<type>'), ... })`.
   - Every field gets `.describe()`; defaults go in the schema (`.default()`), never in the component.
   - Override `w`/`h` defaults with `widgetBase.shape.w.default(n)`.
   - Reuse `thresholdSchema` / `thresholdColor` from `src/widgets/base-schema.ts` for colour steps.
3. **Component** (`<Type>.tsx`): `export function <Type>Widget({ config, ctx }: WidgetProps<WidgetConfigOf<'<type>'>>)`.
   - Data access: `ctx.session.store.latest(name)`, `.series(name, sinceMs)`, `.getStats(name)`, `.names()`. Never copy samples into React state.
   - Refresh: `useLatest(ctx.session, signal, hz)` or `useTick(hz)` from `src/app/hooks.ts` for polling widgets (10 Hz default, table uses 5); `requestAnimationFrame` loop for canvas/plot (see `src/widgets/plot/Plot.tsx`); `useSessionChanged(ctx.session)` for connection-state-driven UI; `ctx.session.frame.on(...)` / `ctx.session.raw.on(...)` for push-style text/bytes (see `log`, `terminal`).
   - Presentation: `ctx.format(signal, value, { decimals, unit })`, `ctx.label(signal)`, `ctx.color(signal)`; `ctx.dashboard.options.timeWindowSec` for default windows.
   - Sending: `ctx.session.send(text, lineEnding)` / `sendBytes(bytes)`; disable controls when `!ctx.session.connected`.
   - Size: `useElementSize()` for canvas-type widgets; the widget body is `position: relative`, fill it with `height: 100%`.
   - Markup: root `<div className="w-<type>" data-signal={config.signal}>`; give the element that shows the value a `data-testid` of the form `<type>-<signal>` (e.g. `` data-testid={`gauge-${config.signal}`} ``) so e2e tests can assert on it.
4. **Styles**: add `.w-<type>` (and `.w-<type>__part` modifiers) to `src/app/styles.css` next to the other `.w-*` blocks. Use the CSS variables (`--fg`, `--muted`, `--track`, `--accent`, `--danger`, `--ok`, `--panel`) and `font-variant-numeric: tabular-nums` for numbers. Dark theme only.
5. **Register in both files** (typecheck fails if you miss one):
   - `src/widgets/schemas.ts`: import `<type>Schema`, add to `widgetSchemas` and to the `widgetSchema` discriminated union.
   - `src/widgets/registry.tsx`: import `<Type>Widget`, add `<type>: { type: '<type>', description: '…', component: <Type>Widget }`.
6. **Schema file**: `pnpm gen:schema` (regenerates `schema/dashboard.schema.json`; commit it).
7. **Test**:
   - Pure logic (formatting, threshold maths, layout maths) → `src/widgets/<type>/<type>.test.ts` (Vitest, Node env, no DOM).
   - Rendering → use the widget in an example dashboard (or a new one under `dashboards/`) and add a step to `tests/e2e/dashboard.spec.ts`: `window.__fakeSerial.feed('…\n')` then `expect(page.getByTestId('<type>-<signal>')).toHaveText(...)`. Run `pnpm build && pnpm test:e2e`.
8. **Docs**: add a section to `docs/CONFIG.md` (options, defaults, default `w`/`h`).
9. `pnpm check` must pass.

## Conventions recap

- No React import in `schema.ts`; no `any`; `import type` for types.
- The store is the source of truth; widgets read it at their own cadence and hold no sample data.
- Canvas/WebGL widgets must cancel their rAF loop in the effect cleanup and recreate only on `config`/`ctx` change, not on every resize (`Plot.tsx` uses a separate `setSize` effect).
