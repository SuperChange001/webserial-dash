/** One numeric observation of a named signal. `t` is epoch milliseconds. */
export interface Sample {
  name: string;
  value: number;
  t: number;
}

/** Returns a function that removes the listener. */
export type Unsubscribe = () => void;
