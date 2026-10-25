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
