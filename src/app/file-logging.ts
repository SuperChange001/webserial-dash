import { FileLogger, joinCsvParts, saveBlob, timestampForFilename, type LogDirectory } from '@/core/logger';
import type { Unsubscribe } from '@/core/types';
import type { Session } from './session';

export type LogTarget = 'folder' | 'browser';

/** Folder picker exists on desktop Chromium; Android and others fall back to OPFS. */
export function canPickFolder(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

async function opfsLogDir(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle('logs', { create: true });
}

/** Columns known up front so the first file already has a stable header. */
function declaredColumns(session: Session): string[] {
  const d = session.dashboard;
  const cols = new Set<string>();
  if (d.source.timestamp) cols.add(d.source.timestamp.field);
  const p = d.source.parser;
  if (p.type === 'csv' || p.type === 'binary') p.fields.forEach((f) => f && cols.add(f));
  Object.keys(d.signals).forEach((s) => cols.add(s));
  return [...cols];
}

/**
 * Owns one continuous file-logging run: subscribes to parsed frames, flushes every second,
 * rotates parts (each closed part is safely on disk).
 */
export class FileLogging {
  logger: FileLogger | null = null;
  target: LogTarget | null = null;
  folderName = '';
  private dir: FileSystemDirectoryHandle | null = null;
  private off: Unsubscribe | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  lastError: string | null = null;

  constructor(private session: Session) {}

  get active(): boolean {
    return this.logger !== null && this.timer !== null;
  }

  /** Must be called from a click handler (the folder picker needs a user gesture). */
  async start(): Promise<void> {
    if (this.active) return;
    this.lastError = null;
    if (canPickFolder()) {
      const picker = (window as unknown as { showDirectoryPicker: (o: unknown) => Promise<FileSystemDirectoryHandle> })
        .showDirectoryPicker;
      this.dir = await picker({ id: 'webserial-dash-logs', mode: 'readwrite', startIn: 'documents' });
      this.target = 'folder';
      this.folderName = this.dir.name;
    } else {
      this.dir = await opfsLogDir();
      this.target = 'browser';
      this.folderName = 'browser storage';
      await navigator.storage.persist?.().catch(() => false);
    }
    const prefix = `${this.session.dashboard.id}-${timestampForFilename()}`;
    this.logger = new FileLogger(this.dir as unknown as LogDirectory, { prefix, columns: declaredColumns(this.session) });
    this.off = this.session.frame.on((f) => this.logger?.addFrame(f.samples));
    this.timer = setInterval(() => {
      this.logger?.flush().catch((e: Error) => {
        this.lastError = e.message;
        void this.stop();
      });
    }, 1000);
    this.session.changed.emit();
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.off?.();
    this.off = null;
    try {
      await this.logger?.stop();
    } catch (e) {
      this.lastError = (e as Error).message;
    }
    this.session.changed.emit();
  }

  /** Browser-storage runs: merge the parts into one CSV download, then delete them. */
  async downloadAndClear(): Promise<void> {
    if (!this.logger || !this.dir || this.target !== 'browser') return;
    const texts: string[] = [];
    for (const name of this.logger.files) texts.push(await (await (await this.dir.getFileHandle(name)).getFile()).text());
    const prefix = this.logger.files[0]?.replace(/-part\d+\.csv$/, '') ?? 'log';
    await saveBlob(new Blob([joinCsvParts(texts)], { type: 'text/csv' }), `${prefix}.csv`);
    for (const name of this.logger.files) await this.dir.removeEntry(name).catch(() => undefined);
    this.logger = null;
    this.session.changed.emit();
  }
}
