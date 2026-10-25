import { describe, expect, it } from 'vitest';
import { Session } from '@/app/session';
import { parseDashboard } from '@/config/schema';
import { SimulatedTransport } from '@/core/transport';
import { decodeText } from '@/core/bytes';

const dashboard = parseDashboard({
  id: 'test',
  name: 'test',
  source: { parser: { type: 'csv', fields: ['a', 'b'] } },
  signals: { b: { scale: 10, offset: 1 } },
});

describe('Session', () => {
  it('frames, parses, scales and keeps recent bytes for late subscribers', async () => {
    const session = new Session(dashboard);
    const tr = new SimulatedTransport({ intervalMs: 60_000, format: 'csv', lineEnding: '\n', echo: false, signals: [], lines: ['1,2', '3,4'] });
    await session.connect(tr);
    tr.tick();
    tr.tick();
    expect(session.store.latest('a')?.v).toBe(3);
    expect(session.store.latest('b')?.v).toBe(41); // 4 * 10 + 1
    expect(session.counters).toMatchObject({ frames: 2, samples: 4, rxBytes: 8 });
    expect(session.recentRx().map(decodeText).join('')).toBe('1,2\n3,4\n');
    session.clearData();
    expect(session.recentRx()).toHaveLength(0);
    await session.disconnect();
    expect(session.status).toBe('closed');
  });

  it('caps the recent byte buffer', async () => {
    const session = new Session(dashboard);
    const big = 'x'.repeat(100_000);
    const tr = new SimulatedTransport({ intervalMs: 60_000, format: 'csv', lineEnding: '\n', echo: false, signals: [], lines: [big] });
    await session.connect(tr);
    for (let i = 0; i < 5; i++) tr.tick();
    const kept = session.recentRx().reduce((n, c) => n + c.length, 0);
    expect(kept).toBeLessThanOrEqual(Session.RECENT_LIMIT + big.length);
    expect(kept).toBeGreaterThan(0);
    await session.disconnect();
  });
});

describe('Session device timestamp', () => {
  const make = (use: boolean) =>
    parseDashboard({
      id: 'ts',
      name: 'ts',
      source: { parser: { type: 'kv' }, timestamp: { field: 'ticks', ticksPerSecond: 1000, use } },
    });
  const lines = ['ticks=1000 v=1', 'ticks=1100 v=2', 'ticks=1200 v=3'];

  it('times samples by device ticks when use=true', async () => {
    const session = new Session(make(true));
    const tr = new SimulatedTransport({ intervalMs: 60_000, format: 'kv', lineEnding: '\n', echo: false, signals: [], lines });
    await session.connect(tr);
    tr.tick();
    tr.tick();
    tr.tick(); // all three arrive within the same few ms of host time
    const t = [...session.store.series('v').t];
    expect(t[1]! - t[0]!).toBe(100);
    expect(t[2]! - t[0]!).toBe(200);
    expect(session.store.latest('ticks')?.v).toBe(1200); // still recorded as a signal
    await session.disconnect();
  });

  it('keeps host arrival time when use=false', async () => {
    const session = new Session(make(false));
    const tr = new SimulatedTransport({ intervalMs: 60_000, format: 'kv', lineEnding: '\n', echo: false, signals: [], lines });
    await session.connect(tr);
    tr.tick();
    tr.tick();
    const t = [...session.store.series('v').t];
    expect(t[1]! - t[0]!).toBeLessThan(50);
    expect(session.store.latest('ticks')?.v).toBe(1100);
    await session.disconnect();
  });
});

describe('Session.setDashboard', () => {
  const base = parseDashboard({ id: 'x', name: 'x', source: { parser: { type: 'kv' } } });
  const feed = async (session: Session) => {
    const tr = new SimulatedTransport({ intervalMs: 60_000, format: 'kv', lineEnding: '\n', echo: false, signals: [], lines: ['a=1'] });
    await session.connect(tr);
    tr.tick();
  };
  it('keeps data when only widgets/layout changed (re-imported JSON)', async () => {
    const session = new Session(base);
    await feed(session);
    session.setDashboard(parseDashboard({ id: 'x', name: 'x v2', source: { parser: { type: 'kv' } }, widgets: [{ type: 'value', signal: 'a' }] }));
    expect(session.store.latest('a')?.v).toBe(1);
    await session.disconnect();
  });
  it('resets data when the parser or another dashboard is selected', async () => {
    const session = new Session(base);
    await feed(session);
    session.setDashboard(parseDashboard({ id: 'x', name: 'x', source: { parser: { type: 'json' } } }));
    expect(session.store.latest('a')).toBeUndefined();
    await session.disconnect();
  });
});
