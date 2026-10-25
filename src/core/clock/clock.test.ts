import { describe, expect, it } from 'vitest';
import { DeviceClock } from './device-clock';

describe('DeviceClock', () => {
  it('keeps device spacing instead of arrival jitter', () => {
    const c = new DeviceClock({ ticksPerSecond: 1000, maxDriftMs: 5000 });
    expect(c.map(500, 10_000)).toBe(10_000);
    // three frames arrive in one USB packet at the same host time
    expect(c.map(600, 10_250)).toBe(10_100);
    expect(c.map(700, 10_250)).toBe(10_200);
    expect(c.map(800, 10_250)).toBe(10_300);
  });
  it('supports microsecond ticks', () => {
    const c = new DeviceClock({ ticksPerSecond: 1_000_000, maxDriftMs: 5000 });
    c.map(0, 1000);
    expect(c.map(2500, 1000)).toBe(1002.5);
  });
  it('re-anchors on reboot (ticks go backwards) and on drift', () => {
    const c = new DeviceClock({ ticksPerSecond: 1000, maxDriftMs: 1000 });
    c.map(100_000, 0);
    expect(c.map(50, 5000)).toBe(5000);
    expect(c.resyncs).toBe(1);
    expect(c.map(10_050, 6000)).toBe(6000); // 10 s of ticks in 1 s of host time → drift
    expect(c.resyncs).toBe(2);
  });
});
