/** Splits a byte stream into frames. Stateful: keeps the partial tail between pushes. */
export interface Framer {
  push(chunk: Uint8Array): Uint8Array[];
  reset(): void;
}

export type FramingConfig =
  | { mode: 'delimiter'; delimiter: string; maxLength: number }
  | { mode: 'startEnd'; start: string; end: string; maxLength: number; includeMarkers: boolean }
  | { mode: 'length'; length: number };
