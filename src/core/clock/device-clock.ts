/**
 * Maps a device tick counter (e.g. Arduino `millis()`) to host epoch milliseconds.
 *
 * The first tick seen is anchored to the host clock at arrival; later samples get
 * `anchorHost + (ticks - anchorTicks) / ticksPerSecond * 1000`. This keeps the device's
 * own sample spacing (no USB/OS jitter) while staying on the wall-clock axis plots use.
 * The anchor is reset when ticks go backwards (device reboot or counter wrap) or when the
 * mapped time drifts from the host clock by more than `maxDriftMs`.
 */
export interface DeviceClockOptions {
  ticksPerSecond: number;
  maxDriftMs: number;
}

export class DeviceClock {
  private anchorTicks: number | null = null;
  private anchorHost = 0;
  private lastTicks = -Infinity;
  /** Number of re-anchors after the first one (reboots, wraps, drift corrections). */
  resyncs = 0;

  constructor(private readonly options: DeviceClockOptions) {
    if (!(options.ticksPerSecond > 0)) throw new Error('ticksPerSecond must be positive');
  }

  /** Host-epoch milliseconds for a frame carrying `ticks`, received at `hostNow`. */
  map(ticks: number, hostNow: number): number {
    if (this.anchorTicks === null || ticks < this.lastTicks) {
      if (this.anchorTicks !== null) this.resyncs++;
      return this.anchor(ticks, hostNow);
    }
    this.lastTicks = ticks;
    const t = this.anchorHost + ((ticks - this.anchorTicks) * 1000) / this.options.ticksPerSecond;
    if (Math.abs(t - hostNow) > this.options.maxDriftMs) {
      this.resyncs++;
      return this.anchor(ticks, hostNow);
    }
    return t;
  }

  private anchor(ticks: number, hostNow: number): number {
    this.anchorTicks = ticks;
    this.anchorHost = hostNow;
    this.lastTicks = ticks;
    return hostNow;
  }

  reset(): void {
    this.anchorTicks = null;
    this.lastTicks = -Infinity;
    this.resyncs = 0;
  }
}
