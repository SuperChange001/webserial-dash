import { concatBytes, indexOfBytes } from '../bytes';
import type { Framer } from './types';

/** Frames end with `delimiter` (e.g. "\n"). A trailing "\r" before "\n" is stripped. */
export class DelimiterFramer implements Framer {
  private buffer: Uint8Array = new Uint8Array(0);

  constructor(
    private readonly delimiter: Uint8Array,
    private readonly maxLength = 4096,
    private readonly stripCR = true,
  ) {
    if (delimiter.length === 0) throw new Error('delimiter must not be empty');
  }

  push(chunk: Uint8Array): Uint8Array[] {
    this.buffer = concatBytes(this.buffer, chunk);
    const frames: Uint8Array[] = [];
    let start = 0;
    for (;;) {
      const idx = indexOfBytes(this.buffer, this.delimiter, start);
      if (idx < 0) break;
      let end = idx;
      if (this.stripCR && end > start && this.buffer[end - 1] === 0x0d) end--;
      frames.push(this.buffer.slice(start, end));
      start = idx + this.delimiter.length;
    }
    this.buffer = this.buffer.slice(start);
    if (this.buffer.length > this.maxLength) {
      // Garbage or a device that never sends the delimiter: drop the oldest bytes.
      this.buffer = this.buffer.slice(this.buffer.length - this.maxLength);
    }
    return frames;
  }

  reset(): void {
    this.buffer = new Uint8Array(0);
  }
}
