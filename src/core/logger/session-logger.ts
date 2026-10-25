import type { Sample } from '../types';

export interface RawChunk {
  t: number;
  dir: 'rx' | 'tx';
  bytes: Uint8Array;
}

export interface LoggerOptions {
  /** Cap on raw bytes kept in memory (default 8 MiB). */
  maxRawBytes?: number;
  /** Cap on parsed samples kept (default 1,000,000). */
  maxSamples?: number;
}

/**
 * Records raw traffic and parsed samples for export. In-memory for now; an OPFS-backed
 * writer for multi-hour logs is planned (see docs/PLAN.md).
 */
export class SessionLogger {
  private raw: RawChunk[] = [];
  private rawBytes = 0;
  /** One entry per parsed frame, so frames arriving in the same millisecond stay separate rows. */
  private rows: Sample[][] = [];
  private samples = 0;
  private _recording = false;
  readonly maxRawBytes: number;
  readonly maxSamples: number;
  startedAt: number | null = null;

  constructor(options: LoggerOptions = {}) {
    this.maxRawBytes = options.maxRawBytes ?? 8 * 1024 * 1024;
    this.maxSamples = options.maxSamples ?? 1_000_000;
  }

  get recording(): boolean {
    return this._recording;
  }

  get sampleCount(): number {
    return this.samples;
  }

  get rawByteCount(): number {
    return this.rawBytes;
  }

  start(now = Date.now()): void {
    this._recording = true;
    this.startedAt ??= now;
  }

  stop(): void {
    this._recording = false;
  }

  clear(): void {
    this.raw = [];
    this.rawBytes = 0;
    this.rows = [];
    this.samples = 0;
    this.startedAt = null;
  }

  addRaw(bytes: Uint8Array, dir: 'rx' | 'tx', t = Date.now()): void {
    if (!this._recording) return;
    this.raw.push({ t, dir, bytes });
    this.rawBytes += bytes.length;
    while (this.rawBytes > this.maxRawBytes && this.raw.length > 1) {
      this.rawBytes -= this.raw.shift()!.bytes.length;
    }
  }

  /** Record the samples of one frame as one logical row. */
  addSamples(samples: readonly Sample[]): void {
    if (!this._recording || samples.length === 0) return;
    this.rows.push([...samples]);
    this.samples += samples.length;
    while (this.samples > this.maxSamples && this.rows.length > 1) this.samples -= this.rows.shift()!.length;
  }

  /** Wide CSV: one row per frame (timestamp of its first sample), one column per signal. */
  toCsv(): string {
    const names: string[] = [];
    const col = new Map<string, number>();
    for (const row of this.rows) for (const s of row) if (!col.has(s.name)) { col.set(s.name, names.length); names.push(s.name); }
    const out: string[] = [`timestamp_ms,iso_time,${names.join(',')}`];
    for (const row of this.rows) {
      const cells: (number | '')[] = names.map(() => '');
      for (const s of row) cells[col.get(s.name)!] = s.value;
      const t = row[0]!.t;
      out.push(`${t},${new Date(t).toISOString()},${cells.join(',')}`);
    }
    return out.join('\n') + '\n';
  }

  /** Concatenated received bytes (what a terminal would have shown). */
  rawToBytes(dir: 'rx' | 'tx' | 'both' = 'rx'): Uint8Array {
    const parts = this.raw.filter((c) => dir === 'both' || c.dir === dir);
    const out = new Uint8Array(parts.reduce((n, c) => n + c.bytes.length, 0));
    let off = 0;
    for (const c of parts) {
      out.set(c.bytes, off);
      off += c.bytes.length;
    }
    return out;
  }

  rawChunks(): readonly RawChunk[] {
    return this.raw;
  }
}
