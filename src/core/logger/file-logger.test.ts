import { describe, expect, it } from 'vitest';
import { FileLogger, joinCsvParts, type LogDirectory } from './file-logger';

/** In-memory directory: content is only visible after close(), like the real API. */
function memDir() {
  const files = new Map<string, string>();
  const dir: LogDirectory = {
    async getFileHandle(name) {
      return {
        async createWritable() {
          let buf = '';
          return {
            write: async (d: string) => void (buf += d),
            close: async () => void files.set(name, buf),
          };
        },
      };
    },
  };
  return { dir, files };
}

describe('FileLogger', () => {
  it('writes wide CSV rows per frame with declared columns first', async () => {
    const { dir, files } = memDir();
    const log = new FileLogger(dir, { prefix: 's', columns: ['b', 'a'] });
    log.addFrame([{ name: 'a', value: 1, t: 1000 }, { name: 'b', value: 2, t: 1000 }]);
    log.addFrame([{ name: 'a', value: 3, t: 1000 }]);
    await log.stop();
    expect(files.get('s-part0001.csv')).toBe(
      'timestamp_ms,iso_time,b,a\n1000,1970-01-01T00:00:01.000Z,2,1\n1000,1970-01-01T00:00:01.000Z,,3\n',
    );
    expect(log.stats).toMatchObject({ parts: 1, rows: 2 });
  });

  it('starts a new part when a signal appears or time elapses', async () => {
    const { dir, files } = memDir();
    let now = 0;
    const log = new FileLogger(dir, { prefix: 's', rotateSeconds: 10, now: () => now });
    log.addFrame([{ name: 'a', value: 1, t: 0 }]);
    await log.flush();
    log.addFrame([{ name: 'a', value: 2, t: 1 }, { name: 'b', value: 9, t: 1 }]);
    await log.flush();
    now = 11_000;
    log.addFrame([{ name: 'a', value: 3, t: 2 }]);
    await log.stop();
    expect([...files.keys()]).toEqual(['s-part0001.csv', 's-part0002.csv', 's-part0003.csv']);
    expect(files.get('s-part0002.csv')!.split('\n')[0]).toBe('timestamp_ms,iso_time,a,b');
    const joined = joinCsvParts([...files.values()]).trim().split('\n');
    expect(joined.filter((l) => l.startsWith('timestamp_ms'))).toHaveLength(2);
    expect(joined).toHaveLength(5);
  });
});
