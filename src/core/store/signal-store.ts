import { Emitter } from '../emitter';
import type { Sample, Unsubscribe } from '../types';
import { RingBuffer } from './ring-buffer';

export interface SignalStats {
  count: number;
  min: number;
  max: number;
  mean: number;
  last: number;
}

export interface Series {
  t: Float64Array;
  v: Float64Array;
}

/**
 * Holds the most recent N samples per signal. Framework-free; UIs subscribe and read on
 * their own schedule (e.g. once per animation frame) to stay cheap at kHz rates.
 */
export class SignalStore {
  private buffers = new Map<string, RingBuffer>();
  private stats = new Map<string, { count: number; min: number; max: number; sum: number }>();
  private changed = new Emitter<ReadonlySet<string>>();
  private totalSamples = 0;

  constructor(public readonly capacity = 10_000) {}

  push(samples: readonly Sample[]): void {
    if (samples.length === 0) return;
    const names = new Set<string>();
    for (const s of samples) {
      if (!Number.isFinite(s.value)) continue;
      let buf = this.buffers.get(s.name);
      if (!buf) {
        buf = new RingBuffer(this.capacity);
        this.buffers.set(s.name, buf);
      }
      buf.push(s.t, s.value);
      const st = this.stats.get(s.name);
      if (st) {
        st.count++;
        st.sum += s.value;
        if (s.value < st.min) st.min = s.value;
        if (s.value > st.max) st.max = s.value;
      } else {
        this.stats.set(s.name, { count: 1, min: s.value, max: s.value, sum: s.value });
      }
      names.add(s.name);
      this.totalSamples++;
    }
    if (names.size) this.changed.emit(names);
  }

  names(): string[] {
    return [...this.buffers.keys()];
  }

  has(name: string): boolean {
    return this.buffers.has(name);
  }

  latest(name: string): { t: number; v: number } | undefined {
    return this.buffers.get(name)?.last();
  }

  series(name: string, since?: number): Series {
    return this.buffers.get(name)?.toArrays(since) ?? { t: new Float64Array(0), v: new Float64Array(0) };
  }

  getStats(name: string): SignalStats | undefined {
    const st = this.stats.get(name);
    const last = this.latest(name);
    if (!st || !last) return undefined;
    return { count: st.count, min: st.min, max: st.max, mean: st.sum / st.count, last: last.v };
  }

  get sampleCount(): number {
    return this.totalSamples;
  }

  /** Called after each batch with the names that changed. */
  subscribe(listener: (names: ReadonlySet<string>) => void): Unsubscribe {
    return this.changed.on(listener);
  }

  clear(): void {
    this.buffers.clear();
    this.stats.clear();
    this.totalSamples = 0;
    this.changed.emit(new Set());
  }
}
