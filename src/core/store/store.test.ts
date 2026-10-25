import { describe, expect, it } from 'vitest';
import { RingBuffer, SignalStore } from './index';

describe('RingBuffer', () => {
  it('keeps the newest N samples in order', () => {
    const r = new RingBuffer(3);
    for (let i = 1; i <= 5; i++) r.push(i * 10, i);
    expect([...r.toArrays().v]).toEqual([3, 4, 5]);
    expect([...r.toArrays().t]).toEqual([30, 40, 50]);
    expect(r.last()).toEqual({ t: 50, v: 5 });
  });
  it('filters by since using binary search across the wrap point', () => {
    const r = new RingBuffer(4);
    for (let i = 1; i <= 6; i++) r.push(i, i);
    expect([...r.toArrays(5).v]).toEqual([5, 6]);
    expect([...r.toArrays(100).v]).toEqual([]);
  });
});

describe('SignalStore', () => {
  it('stores per-signal series, stats and notifies subscribers', () => {
    const s = new SignalStore(100);
    const seen: string[][] = [];
    s.subscribe((names) => seen.push([...names]));
    s.push([
      { name: 'a', value: 1, t: 1 },
      { name: 'b', value: 5, t: 1 },
      { name: 'a', value: 3, t: 2 },
      { name: 'a', value: NaN, t: 3 },
    ]);
    expect(s.names()).toEqual(['a', 'b']);
    expect(s.latest('a')).toEqual({ t: 2, v: 3 });
    expect(s.getStats('a')).toEqual({ count: 2, min: 1, max: 3, mean: 2, last: 3 });
    expect(seen).toEqual([['a', 'b']]);
    expect(s.sampleCount).toBe(3);
  });
});
