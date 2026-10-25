import { concatBytes, indexOfBytes } from '../bytes';
import type { Framer } from './types';

/** Frames are `start ... end`; bytes outside markers are discarded. */
export class StartEndFramer implements Framer {
  private buffer: Uint8Array = new Uint8Array(0);

  constructor(
    private readonly start: Uint8Array,
    private readonly end: Uint8Array,
    private readonly maxLength = 4096,
    private readonly includeMarkers = false,
  ) {
    if (start.length === 0 || end.length === 0) throw new Error('start/end must not be empty');
  }

  push(chunk: Uint8Array): Uint8Array[] {
    this.buffer = concatBytes(this.buffer, chunk);
    const frames: Uint8Array[] = [];
    for (;;) {
      const s = indexOfBytes(this.buffer, this.start);
      if (s < 0) {
        // keep a tail that could be a partial start marker
        const keep = Math.min(this.buffer.length, this.start.length - 1);
        this.buffer = this.buffer.slice(this.buffer.length - keep);
        break;
      }
      const e = indexOfBytes(this.buffer, this.end, s + this.start.length);
      if (e < 0) {
        this.buffer = this.buffer.slice(s);
        if (this.buffer.length > this.maxLength) this.buffer = new Uint8Array(0);
        break;
      }
      frames.push(
        this.includeMarkers ? this.buffer.slice(s, e + this.end.length) : this.buffer.slice(s + this.start.length, e),
      );
      this.buffer = this.buffer.slice(e + this.end.length);
    }
    return frames;
  }

  reset(): void {
    this.buffer = new Uint8Array(0);
  }
}
