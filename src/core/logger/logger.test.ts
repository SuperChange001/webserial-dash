import { describe, expect, it } from 'vitest';
import { SessionLogger } from './session-logger';

describe('SessionLogger', () => {
  it('only records while recording and exports wide CSV', () => {
    const log = new SessionLogger();
    log.addSamples([{ name: 'a', value: 1, t: 1000 }]);
    expect(log.sampleCount).toBe(0);
    log.start();
    log.addSamples([
      { name: 'a', value: 1, t: 1000 },
      { name: 'b', value: 2, t: 1000 },
    ]);
    log.addSamples([{ name: 'a', value: 3, t: 2000 }]);
    log.addRaw(new Uint8Array([65, 66]), 'rx');
    const csv = log.toCsv().split('\n');
    expect(csv[0]).toBe('timestamp_ms,iso_time,a,b');
    expect(csv[1]).toBe('1000,1970-01-01T00:00:01.000Z,1,2');
    expect(csv[2]).toBe('2000,1970-01-01T00:00:02.000Z,3,');
    expect(new TextDecoder().decode(log.rawToBytes())).toBe('AB');
  });
  it('keeps frames from the same millisecond as separate rows', () => {
    const log = new SessionLogger();
    log.start();
    log.addSamples([{ name: 'a', value: 1, t: 5 }]);
    log.addSamples([{ name: 'a', value: 2, t: 5 }]);
    expect(log.toCsv().trim().split('\n')).toHaveLength(3);
  });
  it('caps raw bytes', () => {
    const log = new SessionLogger({ maxRawBytes: 4 });
    log.start();
    log.addRaw(new Uint8Array(3), 'rx');
    log.addRaw(new Uint8Array(3), 'rx');
    expect(log.rawByteCount).toBe(3);
  });
});
