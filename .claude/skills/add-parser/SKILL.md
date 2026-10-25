---
name: add-parser
description: Add a new parser kind to WebSerial Dash's core (src/core/parsers) when a device's serial protocol cannot be described with the existing csv, kv, json, teleplot, regex or binary parsers — e.g. NMEA sentences, MAVLink, Modbus RTU, hex dumps, checksummed frames, multi-line records. Covers the scaffold command, ParserDefinition shape, registry.ts registration, fixture-based table tests and schema regeneration.
---

# Add a parser kind

First confirm the existing parsers (`docs/PROTOCOLS.md`) cannot express the protocol: `regex` with named groups covers most text formats; `binary` with a `startEnd`/`length` framer covers fixed structs. Framing (cutting bytes into frames) is separate from parsing; if only the framing is unusual, extend `src/core/framing/` instead.

## Procedure

1. **Scaffold**: `pnpm new:parser <type>` → `src/core/parsers/<type>/index.ts` and `src/core/parsers/<type>/<type>.test.ts`.
2. **Implement the `ParserDefinition`** (`src/core/parsers/types.ts`):
   ```ts
   export const <type>Schema = z.object({
     type: z.literal('<type>'),
     // options, each with .describe() and a .default() where sensible
   });
   export const <type>Parser: ParserDefinition<typeof <type>Schema> = {
     type: '<type>',
     description: 'One line; shown in docs and in the JSON schema.',
     schema: <type>Schema,
     create(config) {
       return {
         parse(frame: Uint8Array, t: number): Sample[] { /* ... */ },
         reset() { /* clear per-connection state, e.g. learned headers */ },
       };
     },
   };
   ```
   - A frame arrives already cut by the framer (newline-delimited by default, CR stripped). Decode text with `decodeText(frame)` from `src/core/bytes.ts`; use `DataView(frame.buffer, frame.byteOffset, frame.byteLength)` for binary.
   - Emit **raw** numbers; `Session` applies `signals.<name>.scale/offset`. Use `toNumber()` from `../types` for tolerant numeric parsing (`true`/`false` → 1/0, blanks → undefined).
   - Return `[]` for lines you do not understand; never throw (Session swallows exceptions, but a throw drops the whole frame silently).
   - Use the supplied `t` (epoch ms) unless the device provides a timestamp (see `json.timeKey`, `teleplot`).
   - Must be DOM-free and dependency-free (runs in Node tests and in scripts).
3. **Register** in `src/core/parsers/registry.ts`: import, append to `parserDefinitions`, append `.schema` to the `parserSchema` discriminated union. `createParser({ type: '<type>', ... })` now works and the dashboard schema accepts it.
4. **Fixture**: record a few real lines into `tests/fixtures/<type>.txt` (one frame per line; use **Record** + **Export raw** in the app on a live device, or copy from firmware). Keep it small and include one malformed line.
5. **Table test** (pattern from `src/core/parsers/parsers.test.ts`):
   ```ts
   const fixture = (name: string) =>
     readFileSync(new URL(`../../../tests/fixtures/${name}`, import.meta.url), 'utf8').split('\n').filter(Boolean);
   const run = (config, lines) => { const p = createParser(config); return lines.flatMap((l) => p.parse(encodeText(l), 1000)); };
   const pairs = (config, lines) => run(config, lines).map((s) => [s.name, s.value]);

   describe('<type> parser', () => {
     it('parses the fixture', () => {
       expect(pairs({ type: '<type>' }, fixture('<type>.txt'))).toEqual([['a', 1], ['b', 2]]);
     });
   });
   ```
   Either keep the scaffolded `<type>.test.ts` next to the parser or add a `describe` block to `parsers.test.ts`; both are picked up (`src/**/*.test.ts`). Adjust the fixture path depth if the test lives elsewhere.
6. **Simulate support**: `simulate.format` only knows csv/kv/json/teleplot. For a new text protocol, example dashboards must use `simulate.lines` with literal frames; binary protocols cannot be simulated (say so in the dashboard `description`).
7. **Schema + validation**: `pnpm gen:schema`; if the parser declares signal names in config (like csv `fields`), extend the "declared signals" logic in `scripts/validate-dashboards.ts` so widget references are checked.
8. **Docs**: add a section to `docs/PROTOCOLS.md` (expected lines, config options, firmware snippet). Add an example dashboard under `dashboards/` if practical.
9. `pnpm check` must pass.
