import type { Unsubscribe } from '../types';

export type TransportStatus = 'closed' | 'opening' | 'open' | 'closing' | 'error';

export interface OpenOptions {
  baudRate: number;
  dataBits?: 7 | 8;
  stopBits?: 1 | 2;
  parity?: 'none' | 'even' | 'odd';
  flowControl?: 'none' | 'hardware';
  /** OS/browser receive buffer in bytes. Raise for high rates. */
  bufferSize?: number;
}

export interface OutputSignals {
  dataTerminalReady?: boolean;
  requestToSend?: boolean;
  break?: boolean;
}

export interface StatusEvent {
  status: TransportStatus;
  error?: Error;
}

/**
 * A byte pipe to a device. Implementations: SerialTransport (Web Serial / anything
 * PortLike), SimulatedTransport (demo + tests). Planned: Web Bluetooth NUS.
 */
export interface Transport {
  readonly kind: string;
  readonly label: string;
  readonly status: TransportStatus;
  open(options: OpenOptions): Promise<void>;
  close(): Promise<void>;
  write(data: Uint8Array): Promise<void>;
  setSignals?(signals: OutputSignals): Promise<void>;
  onData(listener: (chunk: Uint8Array) => void): Unsubscribe;
  onStatus(listener: (event: StatusEvent) => void): Unsubscribe;
}

/**
 * The subset of the Web Serial `SerialPort` interface we depend on. The same shape is
 * what esptool-js calls `BaudRateConfigurablePort`; WebUSB adapters, Bluetooth bridges
 * and test fakes implement it so SerialTransport never knows the difference.
 */
export interface PortLike {
  readonly readable: ReadableStream<Uint8Array> | null;
  readonly writable: WritableStream<Uint8Array> | null;
  open(options: SerialOptions): Promise<void>;
  close(): Promise<void>;
  getInfo(): SerialPortInfo;
  setSignals?(signals: SerialOutputSignals): Promise<void>;
  forget?(): Promise<void>;
  addEventListener?(type: 'disconnect', listener: () => void): void;
  removeEventListener?(type: 'disconnect', listener: () => void): void;
}
