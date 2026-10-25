import { concatBytes } from '../bytes';
import type { Framer } from './types';

/** Fixed-size frames (binary protocols without markers). */
export class LengthFramer implements Framer {
  private buffer: Uint8Array = new Uint8Array(0);

  constructor(private readonly length: number) {
    if (length <= 0) throw new Error('length must be positive');
  }

  push(chunk: Uint8Array): Uint8Array[] {
    this.buffer = concatBytes(this.buffer, chunk);
    const frames: Uint8Array[] = [];
    let off = 0;
    while (this.buffer.length - off >= this.length) {
      frames.push(this.buffer.slice(off, off + this.length));
      off += this.length;
    }
    this.buffer = this.buffer.slice(off);
    return frames;
  }

  reset(): void {
    this.buffer = new Uint8Array(0);
  }
}
