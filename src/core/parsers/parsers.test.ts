import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { encodeText } from '../bytes';
import { createParser } from './index';

const fixture = (name: string) =>
  readFileSync(new URL(`../../../tests/fixtures/${name}`, import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.length > 0);

const T = 1000;
const run = (config: Parameters<typeof createParser>[0], lines: string[]) => {
  const p = createParser(config);
  return lines.flatMap((l) => p.parse(encodeText(l), T));
};
const pairs = (config: Parameters<typeof createParser>[0], lines: string[]) =>
  run(config, lines).map((s) => [s.name, s.value]);

describe('csv parser', () => {
  it('uses configured field names', () => {
    expect(pairs({ type: 'csv', fields: ['a', 'b'] }, ['1,2', '3,4'])).toEqual([
      ['a', 1], ['b', 2], ['a', 3], ['b', 4],
    ]);
  });
  it('learns names from a header line and supports whitespace separator', () => {
    const got = pairs({ type: 'csv', separator: ' ' }, fixture('csv-with-header.txt'));
    expect(got.slice(0, 3)).toEqual([['temp', 23.5], ['hum', 41], ['pressure', 1013.2]]);
    expect(got).toHaveLength(9);
  });
  it('skips empty-named columns and falls back to colN', () => {
    expect(pairs({ type: 'csv', fields: ['', 'x'], header: false }, ['9,8,7'])).toEqual([['x', 8], ['col2', 7]]);
  });
});

describe('kv parser', () => {
  it('parses = and : pairs with mixed separators', () => {
    expect(pairs({ type: 'kv' }, ['temp=23.5 hum=41', 'T:1,H:2;V:3'])).toEqual([
      ['temp', 23.5], ['hum', 41], ['T', 1], ['H', 2], ['V', 3],
    ]);
  });
});

describe('json parser', () => {
  it('flattens nested objects and arrays', () => {
    expect(pairs({ type: 'json' }, ['{"imu":{"ax":0.1,"g":[1,2]},"ok":true,"name":"x"}'])).toEqual([
      ['imu.ax', 0.1], ['imu.g.0', 1], ['imu.g.1', 2], ['ok', 1],
    ]);
  });
  it('uses timeKey as sample time and ignores non-JSON', () => {
    const got = run({ type: 'json', timeKey: 'ts' }, ['{"ts":42,"v":1}', 'hello']);
    expect(got).toEqual([{ name: 'v', value: 1, t: 42 }]);
  });
});

describe('teleplot parser', () => {
  it('handles plain, timestamped, multi-value and flagged lines', () => {
    const got = run({ type: 'teleplot' }, fixture('teleplot.txt'));
    expect(got).toEqual([
      { name: 'temp', value: 23.5, t: T },
      { name: 'temp', value: 23.6, t: 1700000000000 },
      { name: 'acc', value: 1, t: T },
      { name: 'acc', value: 2, t: T },
      { name: 'acc', value: 3, t: T },
    ]);
  });
});

describe('regex parser', () => {
  it('extracts named groups from log lines', () => {
    const got = pairs(
      { type: 'regex', pattern: 'T=(?<temp>[-\\d.]+)C H=(?<hum>\\d+)% V=(?<vbat>[\\d.]+)' },
      fixture('mixed-log.txt'),
    );
    expect(got).toEqual([['temp', 23.5], ['hum', 41], ['vbat', 3.7], ['temp', 23.7], ['hum', 42], ['vbat', 3.69]]);
  });
  it('collects all matches with the g flag', () => {
    expect(pairs({ type: 'regex', pattern: '(?<n>\\d+)', flags: 'g' }, ['a1 b22'])).toEqual([['n', 1], ['n', 22]]);
  });
});

describe('binary parser', () => {
  it('decodes little-endian struct with header offset', () => {
    const buf = new ArrayBuffer(1 + 2 + 2 + 4);
    const dv = new DataView(buf);
    dv.setUint8(0, 0xaa);
    dv.setUint16(1, 513, true);
    dv.setInt16(3, -2, true);
    dv.setFloat32(5, 1.5, true);
    const p = createParser({ type: 'binary', format: '<Hhf', fields: ['seq', 'temp', 'v'], offset: 1 });
    expect(p.parse(new Uint8Array(buf), T)).toEqual([
      { name: 'seq', value: 513, t: T },
      { name: 'temp', value: -2, t: T },
      { name: 'v', value: 1.5, t: T },
    ]);
  });
  it('ignores short frames and pad bytes', () => {
    const p = createParser({ type: 'binary', format: '>xB', fields: ['b'] });
    expect(p.parse(new Uint8Array([1]), T)).toEqual([]);
    expect(p.parse(new Uint8Array([9, 7]), T)).toEqual([{ name: 'b', value: 7, t: T }]);
  });
});
