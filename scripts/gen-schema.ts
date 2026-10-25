/** Export the Zod dashboard schema to schema/dashboard.schema.json (JSON Schema draft 2020-12). */
import { mkdirSync, writeFileSync } from 'node:fs';
import { z } from 'zod';
import { dashboardSchema } from '../src/config/schema';

const json = z.toJSONSchema(dashboardSchema, { target: 'draft-2020-12', io: 'input', unrepresentable: 'any' });
const out = { $id: 'https://webserial-dash.dev/schema/dashboard.schema.json', title: 'WebSerial Dash dashboard', ...json };
mkdirSync('schema', { recursive: true });
writeFileSync('schema/dashboard.schema.json', JSON.stringify(out, null, 2) + '\n');
console.log('wrote schema/dashboard.schema.json');
