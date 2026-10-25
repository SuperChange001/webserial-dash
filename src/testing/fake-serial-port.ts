import type { PortLike } from '@/core/transport/types';

/**
 * In-memory SerialPort look-alike for unit tests. Feed bytes with `feed()`, inspect
 * what the app wrote in `written`. Mirrors Chrome's behaviour closely enough for
 * SerialTransport: readable/writable are null until open(), a new ReadableStream per open.
 */
export class FakeSerialPort implements PortLike {
  readable: ReadableStream<Uint8Array> | null = null;
  writable: WritableStream<Uint8Array> | null = null;
  written: Uint8Array[] = [];
  signals: SerialOutputSignals[] = [];
  openOptions: SerialOptions | null = null;
  private controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  private listeners = new Set<() => void>();

  constructor(private info: SerialPortInfo = { usbVendorId: 0x1234, usbProductId: 0x5678 }) {}

  async open(options: SerialOptions): Promise<void> {
    if (this.readable) throw new DOMException('Port already open', 'InvalidStateError');
    this.openOptions = options;
    this.readable = new ReadableStream<Uint8Array>({
      start: (c) => {
        this.controller = c;
      },
      cancel: () => {
        this.controller = null;
      },
    });
    this.writable = new WritableStream<Uint8Array>({
      write: (chunk) => {
        this.written.push(chunk);
      },
    });
  }

  async close(): Promise<void> {
    this.controller?.close();
    this.controller = null;
    this.readable = null;
    this.writable = null;
  }

  getInfo(): SerialPortInfo {
    return this.info;
  }

  async setSignals(s: SerialOutputSignals): Promise<void> {
    this.signals.push(s);
  }

  addEventListener(_type: 'disconnect', l: () => void) {
    this.listeners.add(l);
  }

  removeEventListener(_type: 'disconnect', l: () => void) {
    this.listeners.delete(l);
  }

  /** Simulate the device sending bytes (string is UTF-8 encoded). */
  feed(data: string | Uint8Array): void {
    if (!this.controller) throw new Error('port not open');
    this.controller.enqueue(typeof data === 'string' ? new TextEncoder().encode(data) : data);
  }

  /** Simulate a recoverable line error (Chrome throws from read() but keeps the port). */
  injectError(name = 'BufferOverrunError'): void {
    const c = this.controller;
    if (!c) throw new Error('port not open');
    c.error(new DOMException('injected', name));
    // Chrome gives a fresh stream after the error; emulate by replacing readable.
    this.readable = new ReadableStream<Uint8Array>({
      start: (ctrl) => {
        this.controller = ctrl;
      },
      cancel: () => {
        this.controller = null;
      },
    });
  }

  /** Simulate the cable being pulled. */
  disconnect(): void {
    this.controller?.error(new DOMException('The device has been lost.', 'NetworkError'));
    this.controller = null;
    for (const l of this.listeners) l();
  }

  writtenText(): string {
    return this.written.map((w) => new TextDecoder().decode(w)).join('');
  }
}
