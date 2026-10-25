import { Emitter } from '../emitter';
import type { OpenOptions, OutputSignals, PortLike, StatusEvent, Transport, TransportStatus } from './types';

/** Errors Chrome reports for line noise; the port stays usable, so we keep reading. */
const RECOVERABLE = new Set(['BufferOverrunError', 'FramingError', 'ParityError', 'BreakError']);

export function describePort(info: SerialPortInfo): string {
  const vid = info.usbVendorId?.toString(16).padStart(4, '0');
  const pid = info.usbProductId?.toString(16).padStart(4, '0');
  if (vid && pid) return `USB ${vid}:${pid}`;
  if (info.bluetoothServiceClassId) return `Bluetooth ${String(info.bluetoothServiceClassId)}`;
  return 'Serial port';
}

/**
 * Transport over anything that looks like a Web Serial `SerialPort`.
 *
 * Read strategy follows esptool-js / Chrome's guidance: one long-lived reader per open,
 * re-acquired after recoverable errors, cancelled on close. Writes lock the writer per call.
 */
export class SerialTransport implements Transport {
  readonly kind = 'serial';
  private _status: TransportStatus = 'closed';
  private data = new Emitter<Uint8Array>();
  private statusEmitter = new Emitter<StatusEvent>();
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private readLoopPromise: Promise<void> | null = null;
  private onDisconnect = () => void this.handleDeviceLost(new Error('Device disconnected'));

  constructor(public readonly port: PortLike) {}

  get label(): string {
    return describePort(this.port.getInfo());
  }

  get status(): TransportStatus {
    return this._status;
  }

  onData(listener: (chunk: Uint8Array) => void) {
    return this.data.on(listener);
  }

  onStatus(listener: (event: StatusEvent) => void) {
    return this.statusEmitter.on(listener);
  }

  private setStatus(status: TransportStatus, error?: Error) {
    this._status = status;
    this.statusEmitter.emit(error ? { status, error } : { status });
  }

  async open(options: OpenOptions): Promise<void> {
    if (this._status !== 'closed' && this._status !== 'error') throw new Error(`Cannot open while ${this._status}`);
    this.setStatus('opening');
    try {
      await this.port.open({
        baudRate: options.baudRate,
        dataBits: options.dataBits ?? 8,
        stopBits: options.stopBits ?? 1,
        parity: options.parity ?? 'none',
        flowControl: options.flowControl ?? 'none',
        bufferSize: options.bufferSize ?? 64 * 1024,
      });
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      this.setStatus('error', err);
      throw err;
    }
    this.port.addEventListener?.('disconnect', this.onDisconnect);
    this.setStatus('open');
    this.readLoopPromise = this.readLoop();
  }

  private async readLoop(): Promise<void> {
    while (this._status === 'open' && this.port.readable) {
      const reader = this.port.readable.getReader();
      this.reader = reader;
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value && value.length) this.data.emit(value);
        }
        break; // stream ended cleanly (close() or device gone)
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        if (RECOVERABLE.has(err.name)) continue; // re-acquire reader and keep going
        if (this._status === 'open') await this.handleDeviceLost(err);
        break;
      } finally {
        reader.releaseLock();
        this.reader = null;
      }
    }
  }

  private async handleDeviceLost(err: Error) {
    if (this._status !== 'open') return;
    this.setStatus('error', err);
    try {
      await this.port.close();
    } catch {
      /* already gone */
    }
  }

  async write(data: Uint8Array): Promise<void> {
    if (this._status !== 'open' || !this.port.writable) throw new Error('Port is not open');
    const writer = this.port.writable.getWriter();
    try {
      await writer.write(data);
    } finally {
      writer.releaseLock();
    }
  }

  async setSignals(signals: OutputSignals): Promise<void> {
    if (!this.port.setSignals) return;
    await this.port.setSignals(signals);
  }

  async close(): Promise<void> {
    if (this._status === 'closed' || this._status === 'closing') return;
    const wasError = this._status === 'error';
    this.setStatus('closing');
    this.port.removeEventListener?.('disconnect', this.onDisconnect);
    try {
      await this.reader?.cancel();
    } catch {
      /* ignore */
    }
    await this.readLoopPromise?.catch(() => undefined);
    this.readLoopPromise = null;
    if (!wasError) {
      try {
        await this.port.close();
      } catch {
        /* ignore */
      }
    }
    this.setStatus('closed');
  }
}
