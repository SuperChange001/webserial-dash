import { describe, expect, it, vi } from 'vitest';
import { FakeSerialPort } from '@/testing/fake-serial-port';
import { decodeText, encodeText } from '../bytes';
import { SerialTransport } from './serial-transport';
import { SimulatedTransport, expandTemplate } from './simulated-transport';

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('SerialTransport', () => {
  it('opens, receives, writes and closes', async () => {
    const port = new FakeSerialPort();
    const tr = new SerialTransport(port);
    const chunks: string[] = [];
    const statuses: string[] = [];
    tr.onData((c) => chunks.push(decodeText(c)));
    tr.onStatus((e) => statuses.push(e.status));
    await tr.open({ baudRate: 9600 });
    expect(port.openOptions?.baudRate).toBe(9600);
    port.feed('hello\n');
    await flush();
    expect(chunks).toEqual(['hello\n']);
    await tr.write(encodeText('cmd\n'));
    expect(port.writtenText()).toBe('cmd\n');
    await tr.setSignals({ dataTerminalReady: true });
    expect(port.signals).toEqual([{ dataTerminalReady: true }]);
    await tr.close();
    expect(statuses).toEqual(['opening', 'open', 'closing', 'closed']);
    expect(port.readable).toBeNull();
  });

  it('survives recoverable errors and keeps reading', async () => {
    const port = new FakeSerialPort();
    const tr = new SerialTransport(port);
    const chunks: string[] = [];
    tr.onData((c) => chunks.push(decodeText(c)));
    await tr.open({ baudRate: 115200 });
    port.feed('a');
    await flush();
    port.injectError('BufferOverrunError');
    await flush();
    port.feed('b');
    await flush();
    expect(chunks).toEqual(['a', 'b']);
    expect(tr.status).toBe('open');
    await tr.close();
  });

  it('reports error status when the device is lost', async () => {
    const port = new FakeSerialPort();
    const tr = new SerialTransport(port);
    const events: { status: string; error?: string }[] = [];
    tr.onStatus((e) => events.push({ status: e.status, error: e.error?.message }));
    await tr.open({ baudRate: 115200 });
    port.disconnect();
    await flush();
    expect(tr.status).toBe('error');
    expect(events.at(-1)?.status).toBe('error');
    await tr.close();
    expect(tr.status).toBe('closed');
  });
});

describe('SimulatedTransport', () => {
  it('emits formatted lines and echoes writes', async () => {
    vi.useFakeTimers();
    const tr = new SimulatedTransport({
      intervalMs: 10,
      format: 'kv',
      lineEnding: '\n',
      echo: true,
      signals: [{ name: 'c', waveform: 'counter', min: 0, max: 100, periodMs: 0, decimals: 0 }],
    });
    const out: string[] = [];
    tr.onData((c) => out.push(decodeText(c)));
    await tr.open({ baudRate: 0 });
    vi.advanceTimersByTime(25);
    await tr.write(encodeText('hi\r\n'));
    await tr.close();
    vi.useRealTimers();
    expect(out).toEqual(['c=0\n', 'c=1\n', 'echo: hi\n']);
  });
  it('replays scripted lines in a loop', async () => {
    const tr = new SimulatedTransport({ intervalMs: 1000, format: 'csv', lineEnding: '\n', echo: false, signals: [], lines: ['1', '2'] });
    const out: string[] = [];
    tr.onData((c) => out.push(decodeText(c)));
    await tr.open({ baudRate: 0 });
    tr.tick();
    tr.tick();
    tr.tick();
    await tr.close();
    expect(out).toEqual(['1\n', '2\n', '1\n']);
  });
});

describe('SimulatedTransport responses', () => {
  it('replies to scripted commands with expanded templates', async () => {
    vi.useFakeTimers();
    const tr = new SimulatedTransport({
      intervalMs: 60_000, format: 'kv', lineEnding: '\n', echo: false, signals: [],
      responses: { speedtest: ['down={{rand:10:20:1}} n={{rand:5:5}}'] },
    });
    const out: string[] = [];
    tr.onData((c) => out.push(decodeText(c)));
    await tr.open({ baudRate: 0 });
    await tr.write(encodeText('speedtest\r\n'));
    await tr.write(encodeText('unknown\n'));
    vi.advanceTimersByTime(500);
    await tr.close();
    vi.useRealTimers();
    expect(out).toHaveLength(1);
    expect(out[0]).toMatch(/^down=1\d\.\d n=5\n$/);
  });
});

describe('expandTemplate', () => {
  it('replaces rand placeholders and leaves other text', () => {
    expect(expandTemplate('a={{rand:0:10:2}} b', () => 0.5)).toBe('a=5.00 b');
    expect(expandTemplate('x={{rand:-90:-50}}', () => 0)).toBe('x=-90');
  });
});
