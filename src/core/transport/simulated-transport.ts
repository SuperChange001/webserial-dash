import { Emitter } from '../emitter';
import { encodeText } from '../bytes';
import type { OpenOptions, OutputSignals, StatusEvent, Transport, TransportStatus } from './types';

export type Waveform = 'sine' | 'square' | 'triangle' | 'sawtooth' | 'noise' | 'counter' | 'constant';

export interface SimulatedSignal {
  name: string;
  waveform: Waveform;
  min: number;
  max: number;
  /** Period in milliseconds for periodic waveforms. */
  periodMs: number;
  /** Fixed decimals when formatting. */
  decimals: number;
}

export type SimulatedFormat = 'csv' | 'kv' | 'json' | 'teleplot';

/**
 * Describes a fake device so a dashboard can run without hardware (demo mode, tests).
 * Either `lines` (replayed in a loop) or generated `signals` in a text `format`.
 */
export interface SimulateSpec {
  intervalMs: number;
  format: SimulatedFormat;
  lineEnding: string;
  signals: SimulatedSignal[];
  lines?: string[];
  /** When true, bytes written to the transport are echoed back as `echo: ...` lines. */
  echo: boolean;
}

export function sampleWaveform(sig: SimulatedSignal, tMs: number, counter: number): number {
  const span = sig.max - sig.min;
  const phase = sig.periodMs > 0 ? (tMs % sig.periodMs) / sig.periodMs : 0;
  switch (sig.waveform) {
    case 'sine':
      return sig.min + (span * (1 + Math.sin(phase * 2 * Math.PI))) / 2;
    case 'square':
      return phase < 0.5 ? sig.max : sig.min;
    case 'triangle':
      return sig.min + span * (phase < 0.5 ? phase * 2 : 2 - phase * 2);
    case 'sawtooth':
      return sig.min + span * phase;
    case 'noise':
      return sig.min + span * Math.random();
    case 'counter':
      return sig.min + (counter % (span + 1));
    case 'constant':
      return sig.min;
  }
}

export function formatLine(format: SimulatedFormat, values: { name: string; value: string }[]): string {
  switch (format) {
    case 'csv':
      return values.map((v) => v.value).join(',');
    case 'kv':
      return values.map((v) => `${v.name}=${v.value}`).join(' ');
    case 'json':
      return JSON.stringify(Object.fromEntries(values.map((v) => [v.name, Number(v.value)])));
    case 'teleplot':
      return values.map((v) => `>${v.name}:${v.value}`).join('\n');
  }
}

/** A transport that produces data from a SimulateSpec. Timer-driven; no DOM needed. */
export class SimulatedTransport implements Transport {
  readonly kind = 'simulated';
  readonly label: string;
  private _status: TransportStatus = 'closed';
  private data = new Emitter<Uint8Array>();
  private statusEmitter = new Emitter<StatusEvent>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private counter = 0;
  private startedAt = 0;

  constructor(
    public readonly spec: SimulateSpec,
    label = 'Simulated device',
    private now: () => number = () => Date.now(),
  ) {
    this.label = label;
  }

  get status() {
    return this._status;
  }

  onData(listener: (chunk: Uint8Array) => void) {
    return this.data.on(listener);
  }

  onStatus(listener: (event: StatusEvent) => void) {
    return this.statusEmitter.on(listener);
  }

  private setStatus(status: TransportStatus) {
    this._status = status;
    this.statusEmitter.emit({ status });
  }

  async open(_options: OpenOptions): Promise<void> {
    if (this._status === 'open') return;
    this.startedAt = this.now();
    this.counter = 0;
    this.setStatus('open');
    this.timer = setInterval(() => this.tick(), Math.max(1, this.spec.intervalMs));
  }

  /** Emit one line. Public so tests can drive it deterministically. */
  tick(): void {
    if (this._status !== 'open') return;
    const line = this.nextLine();
    this.counter++;
    this.data.emit(encodeText(line + this.spec.lineEnding));
  }

  private nextLine(): string {
    if (this.spec.lines && this.spec.lines.length > 0) {
      return this.spec.lines[this.counter % this.spec.lines.length]!;
    }
    const t = this.now() - this.startedAt;
    const values = this.spec.signals.map((s) => ({
      name: s.name,
      value: sampleWaveform(s, t, this.counter).toFixed(s.decimals),
    }));
    return formatLine(this.spec.format, values);
  }

  async write(data: Uint8Array): Promise<void> {
    if (this._status !== 'open') throw new Error('Simulated transport is not open');
    if (this.spec.echo) {
      const text = new TextDecoder().decode(data).replace(/[\r\n]+$/, '');
      this.data.emit(encodeText(`echo: ${text}${this.spec.lineEnding}`));
    }
  }

  async setSignals(_signals: OutputSignals): Promise<void> {
    /* no-op */
  }

  async close(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this._status !== 'closed') this.setStatus('closed');
  }
}
