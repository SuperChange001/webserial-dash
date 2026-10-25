import { Emitter } from '@/core/emitter';
import { encodeText, unescapeString } from '@/core/bytes';
import { DeviceClock } from '@/core/clock';
import { createFramer, type Framer } from '@/core/framing';
import { SessionLogger } from '@/core/logger';
import { createParser, type Parser } from '@/core/parsers';
import { SignalStore } from '@/core/store';
import type { OutputSignals, StatusEvent, Transport, TransportStatus } from '@/core/transport';
import type { Sample, Unsubscribe } from '@/core/types';
import type { Dashboard } from '@/config/schema';

export interface RawEvent {
  dir: 'rx' | 'tx';
  bytes: Uint8Array;
  t: number;
}

export interface FrameEvent {
  text: string;
  bytes: Uint8Array;
  t: number;
  samples: Sample[];
}

export interface SessionCounters {
  rxBytes: number;
  txBytes: number;
  frames: number;
  samples: number;
  /** Device-clock re-anchors (reboots, counter wraps, drift). */
  clockResyncs: number;
}

/**
 * Wires transport → framer → parser → store/logger for one dashboard.
 * Framework-free so it can be unit tested and reused outside React.
 */
export class Session {
  store: SignalStore;
  readonly logger = new SessionLogger();
  transport: Transport | null = null;
  status: TransportStatus = 'closed';
  error: Error | null = null;
  counters: SessionCounters = { rxBytes: 0, txBytes: 0, frames: 0, samples: 0, clockResyncs: 0 };
  signals: OutputSignals = { dataTerminalReady: true, requestToSend: true };

  readonly raw = new Emitter<RawEvent>();
  readonly frame = new Emitter<FrameEvent>();
  /** Fires on any status/counter change the UI chrome should re-render for. */
  readonly changed = new Emitter<void>();

  private framer: Framer;
  private parser: Parser;
  private clock: DeviceClock | null = null;
  /** Last device-clock frame time; buffers assume non-decreasing time per signal. */
  private lastClockT = -Infinity;
  private unsubs: Unsubscribe[] = [];
  private decoder = new TextDecoder('utf-8', { fatal: false });
  /** Recent RX bytes so late-mounting views (lazy-loaded terminal) can catch up. */
  private recent: Uint8Array[] = [];
  private recentBytes = 0;
  static readonly RECENT_LIMIT = 256 * 1024;
  private scaleCache = new Map<string, { scale: number; offset: number }>();

  constructor(public dashboard: Dashboard) {
    this.store = new SignalStore(dashboard.options.bufferSamples);
    this.framer = createFramer(dashboard.source.framing);
    this.parser = createParser(dashboard.source.parser);
    this.buildScaleCache();
    this.buildClock();
  }

  /**
   * Swap dashboards. Keeps the connection. If only presentation changed (same id, same
   * source/signals/buffer size, e.g. an edited JSON re-imported) the data is kept so the
   * new layout shows immediately; otherwise buffers reset because signal names may change.
   */
  setDashboard(dashboard: Dashboard): void {
    const prev = this.dashboard;
    const sameData =
      prev.id === dashboard.id &&
      prev.options.bufferSamples === dashboard.options.bufferSamples &&
      JSON.stringify(prev.source) === JSON.stringify(dashboard.source) &&
      JSON.stringify(prev.signals) === JSON.stringify(dashboard.signals);
    this.dashboard = dashboard;
    if (sameData) {
      this.changed.emit();
      return;
    }
    this.store = new SignalStore(dashboard.options.bufferSamples);
    this.framer = createFramer(dashboard.source.framing);
    this.parser = createParser(dashboard.source.parser);
    this.buildScaleCache();
    this.buildClock();
    this.counters = { rxBytes: 0, txBytes: 0, frames: 0, samples: 0, clockResyncs: 0 };
    this.logger.clear();
    this.recent = [];
    this.recentBytes = 0;
    this.changed.emit();
  }

  /** Bytes received recently (oldest first), capped at RECENT_LIMIT. */
  recentRx(): readonly Uint8Array[] {
    return this.recent;
  }

  private buildClock() {
    const ts = this.dashboard.source.timestamp;
    this.clock = ts?.use ? new DeviceClock({ ticksPerSecond: ts.ticksPerSecond, maxDriftMs: ts.maxDriftMs }) : null;
  }

  private buildScaleCache() {
    this.scaleCache.clear();
    for (const [name, meta] of Object.entries(this.dashboard.signals)) {
      if (meta.scale !== 1 || meta.offset !== 0) this.scaleCache.set(name, { scale: meta.scale, offset: meta.offset });
    }
  }

  get connected(): boolean {
    return this.status === 'open';
  }

  async connect(transport: Transport): Promise<void> {
    if (this.transport) await this.disconnect();
    this.transport = transport;
    this.error = null;
    this.framer.reset();
    this.parser.reset?.();
    this.clock?.reset();
    this.lastClockT = -Infinity;
    this.unsubs.push(transport.onData((chunk) => this.handleData(chunk)));
    this.unsubs.push(transport.onStatus((e) => this.handleStatus(e)));
    const src = this.dashboard.source;
    this.status = 'opening';
    this.changed.emit();
    try {
      await transport.open({
        baudRate: src.baudRate,
        dataBits: src.dataBits,
        stopBits: src.stopBits,
        parity: src.parity,
        flowControl: src.flowControl,
        bufferSize: src.bufferSize,
      });
      if (transport.setSignals) await transport.setSignals(this.signals).catch(() => undefined);
    } catch (e) {
      this.error = e instanceof Error ? e : new Error(String(e));
      this.status = 'error';
      this.changed.emit();
      throw this.error;
    }
  }

  async disconnect(): Promise<void> {
    const t = this.transport;
    if (!t) return;
    await t.close();
    for (const u of this.unsubs) u();
    this.unsubs = [];
    this.transport = null;
    this.status = 'closed';
    this.changed.emit();
  }

  private handleStatus(e: StatusEvent) {
    this.status = e.status;
    this.error = e.error ?? null;
    this.changed.emit();
  }

  private handleData(chunk: Uint8Array) {
    const t = Date.now();
    this.counters.rxBytes += chunk.length;
    this.recent.push(chunk);
    this.recentBytes += chunk.length;
    while (this.recentBytes > Session.RECENT_LIMIT && this.recent.length > 1) this.recentBytes -= this.recent.shift()!.length;
    this.logger.addRaw(chunk, 'rx', t);
    this.raw.emit({ dir: 'rx', bytes: chunk, t });
    const frames = this.framer.push(chunk);
    if (frames.length === 0) return;
    const batch: Sample[] = [];
    for (const f of frames) {
      let samples: Sample[];
      try {
        samples = this.parser.parse(f, t);
      } catch {
        samples = [];
      }
      let frameT = t;
      if (this.clock && samples.length) {
        const field = this.dashboard.source.timestamp!.field;
        const tick = samples.find((s) => s.name === field);
        if (tick) {
          frameT = Math.max(this.clock.map(tick.value, t), this.lastClockT);
          this.lastClockT = frameT;
          for (const s of samples) s.t = frameT;
          this.counters.clockResyncs = this.clock.resyncs;
        }
      }
      if (this.scaleCache.size) {
        for (const s of samples) {
          const k = this.scaleCache.get(s.name);
          if (k) s.value = s.value * k.scale + k.offset;
        }
      }
      this.counters.frames++;
      for (const s of samples) batch.push(s);
      this.logger.addSamples(samples);
      if (this.frame.size) this.frame.emit({ text: this.decoder.decode(f), bytes: f, t: frameT, samples });
    }
    if (batch.length) {
      this.counters.samples += batch.length;
      this.store.push(batch);
    }
  }

  /** Send text; `lineEnding` is appended and escapes in both are interpreted. */
  async send(text: string, lineEnding = ''): Promise<void> {
    await this.sendBytes(encodeText(unescapeString(text) + unescapeString(lineEnding)));
  }

  async sendBytes(bytes: Uint8Array): Promise<void> {
    if (!this.transport || this.status !== 'open') throw new Error('Not connected');
    await this.transport.write(bytes);
    this.counters.txBytes += bytes.length;
    this.logger.addRaw(bytes, 'tx');
    this.raw.emit({ dir: 'tx', bytes, t: Date.now() });
  }

  async setSignals(signals: OutputSignals): Promise<void> {
    this.signals = { ...this.signals, ...signals };
    if (this.transport?.setSignals && this.status === 'open') await this.transport.setSignals(signals);
    this.changed.emit();
  }

  /** Pulse DTR/RTS the way Arduino IDE / esptool reset a board. */
  async resetDevice(): Promise<void> {
    await this.setSignals({ dataTerminalReady: false, requestToSend: true });
    await new Promise((r) => setTimeout(r, 100));
    await this.setSignals({ dataTerminalReady: true, requestToSend: false });
    await new Promise((r) => setTimeout(r, 50));
    await this.setSignals({ dataTerminalReady: true, requestToSend: true });
  }

  clearData(): void {
    this.store.clear();
    this.logger.clear();
    this.recent = [];
    this.recentBytes = 0;
    this.counters = { rxBytes: 0, txBytes: 0, frames: 0, samples: 0, clockResyncs: 0 };
    this.changed.emit();
  }
}
