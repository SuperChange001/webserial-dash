/** Fixed-capacity time/value ring buffer backed by typed arrays. */
export class RingBuffer {
  private t: Float64Array;
  private v: Float64Array;
  private head = 0; // next write index
  private count = 0;

  constructor(public readonly capacity: number) {
    if (capacity <= 0) throw new Error('capacity must be positive');
    this.t = new Float64Array(capacity);
    this.v = new Float64Array(capacity);
  }

  get length(): number {
    return this.count;
  }

  push(t: number, v: number): void {
    this.t[this.head] = t;
    this.v[this.head] = v;
    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) this.count++;
  }

  last(): { t: number; v: number } | undefined {
    if (this.count === 0) return undefined;
    const i = (this.head - 1 + this.capacity) % this.capacity;
    return { t: this.t[i]!, v: this.v[i]! };
  }

  /** Oldest-to-newest copies. Optionally only samples with t >= since. */
  toArrays(since?: number): { t: Float64Array; v: Float64Array } {
    const start = (this.head - this.count + this.capacity) % this.capacity;
    let skip = 0;
    if (since !== undefined) {
      // samples are time-ordered, so binary search for the first t >= since
      let lo = 0;
      let hi = this.count;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (this.t[(start + mid) % this.capacity]! < since) lo = mid + 1;
        else hi = mid;
      }
      skip = lo;
    }
    const n = this.count - skip;
    const t = new Float64Array(n);
    const v = new Float64Array(n);
    const from = (start + skip) % this.capacity;
    const firstPart = Math.min(n, this.capacity - from);
    t.set(this.t.subarray(from, from + firstPart), 0);
    v.set(this.v.subarray(from, from + firstPart), 0);
    if (n > firstPart) {
      t.set(this.t.subarray(0, n - firstPart), firstPart);
      v.set(this.v.subarray(0, n - firstPart), firstPart);
    }
    return { t, v };
  }

  clear(): void {
    this.head = 0;
    this.count = 0;
  }
}
