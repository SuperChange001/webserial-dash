/** Validate every dashboards/*.json against the schema and check signal references. */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { formatIssues, safeParseDashboard } from '../src/config/schema';

const dir = process.argv[2] ?? 'dashboards';
let failed = 0;
const ids = new Set<string>();
for (const file of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
  const path = join(dir, file);
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    console.error(`✖ ${path}: invalid JSON (${(e as Error).message})`);
    failed++;
    continue;
  }
  const r = safeParseDashboard(raw);
  if (!r.success) {
    console.error(`✖ ${path}`);
    for (const i of formatIssues(r.error)) console.error(`    ${i}`);
    failed++;
    continue;
  }
  const d = r.data;
  const warnings: string[] = [];
  if (ids.has(d.id)) warnings.push(`duplicate id "${d.id}"`);
  ids.add(d.id);
  if (file !== `${d.id}.json`) warnings.push(`file name should be ${d.id}.json`);
  const declared = new Set([...Object.keys(d.signals), ...(d.source.simulate?.signals.map((s) => s.name) ?? [])]);
  if (d.source.parser.type === 'csv') d.source.parser.fields.forEach((f) => f && declared.add(f));
  if (d.source.parser.type === 'binary') d.source.parser.fields.forEach((f) => f && declared.add(f));
  if (d.source.parser.type === 'regex') for (const m of d.source.parser.pattern.matchAll(/\(\?<(\w+)>/g)) declared.add(m[1]!);
  const used = d.widgets.flatMap((w) => ('signal' in w ? [w.signal] : 'signals' in w ? w.signals : []));
  if (declared.size) for (const s of used) if (!declared.has(s)) warnings.push(`widget references signal "${s}" that is not declared in signals/parser/simulate`);
  if (d.source.simulate && d.source.simulate.format !== d.source.parser.type && !d.source.simulate.lines && d.source.parser.type !== 'regex')
    warnings.push(`simulate.format "${d.source.simulate.format}" differs from parser type "${d.source.parser.type}"`);
  console.log(`✔ ${path} (${d.widgets.length} widgets)`);
  for (const w of warnings) console.log(`    ⚠ ${w}`);
}
if (failed) {
  console.error(`${failed} dashboard(s) invalid`);
  process.exit(1);
}
