import type { Sample } from '../types';

/** The slice of FileSystemDirectoryHandle we use; OPFS and showDirectoryPicker() both provide it. */
export interface LogDirectory {
  getFileHandle(name: string, options?: { create?: boolean }): Promise<{
    createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>;
  }>;
}

export interface FileLoggerOptions {
  /** File name prefix; parts are `<prefix>-part0001.csv`, `-part0002.csv`, ... */
  prefix: string;
  /** Start a new part after this many seconds (default 60). A part is only durable once closed. */
  rotateSeconds?: number;
  /** ...or after this many bytes (default 50 MB). */
  rotateBytes?: number;
  /** Columns to always include, in order (e.g. signals declared by the dashboard). */
  columns?: string[];
  now?: () => number;
}

export interface FileLoggerStats {
  parts: number;
  rows: number;
  bytes: number;
  currentFile: string | null;
}

type Writable = Awaited<ReturnType<Awaited<ReturnType<LogDirectory['getFileHandle']>>['createWritable']>>;

/**
 * Streams parsed samples to CSV files on disk while recording, so sessions are limited by
 * disk space instead of RAM. One row per frame, one column per signal (wide format).
 * When a new signal appears mid-session a new part starts with the extended header.
 */
export class FileLogger {
  private pending: Sample[][] = [];
  private columns: string[];
  private colIndex = new Map<string, number>();
  private writer: Writable | null = null;
  private partStartedAt = 0;
  private partBytes = 0;
  private chain: Promise<void> = Promise.resolve();
  private stopped = false;
  readonly files: string[] = [];
  readonly stats: FileLoggerStats = { parts: 0, rows: 0, bytes: 0, currentFile: null };
  private readonly rotateMs: number;
  private readonly rotateBytes: number;
  private readonly now: () => number;

  constructor(
    private readonly dir: LogDirectory,
    private readonly options: FileLoggerOptions,
  ) {
    this.columns = [];
    for (const c of options.columns ?? []) this.addColumn(c);
    this.rotateMs = (options.rotateSeconds ?? 60) * 1000;
    this.rotateBytes = options.rotateBytes ?? 50 * 1024 * 1024;
    this.now = options.now ?? Date.now;
  }

  private addColumn(name: string) {
    if (this.colIndex.has(name)) return false;
    this.colIndex.set(name, this.columns.length);
    this.columns.push(name);
    return true;
  }

  /** Queue the samples of one frame (cheap; call from the data path). */
  addFrame(samples: readonly Sample[]): void {
    if (this.stopped || samples.length === 0) return;
    this.pending.push([...samples]);
  }

  /** Write queued rows; call periodically (e.g. every second). Rotates parts as needed. */
  flush(): Promise<void> {
    this.chain = this.chain.then(() => this.doFlush());
    return this.chain;
  }

  private async doFlush(): Promise<void> {
    const rows = this.pending;
    this.pending = [];
    let newColumns = false;
    for (const r of rows) for (const s of r) if (this.addColumn(s.name)) newColumns = true;
    const due = this.writer && (this.now() - this.partStartedAt >= this.rotateMs || this.partBytes >= this.rotateBytes);
    if (!this.writer || newColumns || due) await this.openPart();
    if (rows.length === 0) return;
    const lines: string[] = [];
    for (const r of rows) {
      const cells: (number | '')[] = this.columns.map(() => '');
      for (const s of r) cells[this.colIndex.get(s.name)!] = s.value;
      const t = r[0]!.t;
      lines.push(`${t},${new Date(t).toISOString()},${cells.join(',')}`);
    }
    await this.write(lines.join('\n') + '\n');
    this.stats.rows += rows.length;
  }

  private async openPart(): Promise<void> {
    await this.writer?.close();
    const name = `${this.options.prefix}-part${String(this.files.length + 1).padStart(4, '0')}.csv`;
    const handle = await this.dir.getFileHandle(name, { create: true });
    this.writer = await handle.createWritable();
    this.files.push(name);
    this.stats.parts = this.files.length;
    this.stats.currentFile = name;
    this.partStartedAt = this.now();
    this.partBytes = 0;
    await this.write(`timestamp_ms,iso_time,${this.columns.join(',')}\n`);
  }

  private async write(text: string) {
    await this.writer!.write(text);
    this.partBytes += text.length;
    this.stats.bytes += text.length;
  }

  /** Flush and close the current part. Further frames are ignored. */
  async stop(): Promise<void> {
    if (this.stopped) return;
    await this.flush();
    this.stopped = true;
    this.chain = this.chain.then(async () => {
      await this.writer?.close();
      this.writer = null;
      this.stats.currentFile = null;
    });
    await this.chain;
  }
}

/**
 * Join CSV parts into one text, keeping a header line only when it differs from the
 * previous one (columns added mid-session).
 */
export function joinCsvParts(parts: readonly string[]): string {
  let lastHeader = '';
  const out: string[] = [];
  for (const p of parts) {
    const nl = p.indexOf('\n');
    const header = nl < 0 ? p : p.slice(0, nl);
    const body = nl < 0 ? '' : p.slice(nl + 1);
    if (header !== lastHeader) out.push(header + '\n');
    lastHeader = header;
    out.push(body);
  }
  return out.join('');
}
