const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: false });

export const encodeText = (s: string): Uint8Array => encoder.encode(s);
export const decodeText = (b: Uint8Array): string => decoder.decode(b);

/** Interpret JSON-style escapes (\n, \r, \t, \xNN, \\) in a user supplied string. */
export function unescapeString(s: string): string {
  return s.replace(/\\(x[0-9a-fA-F]{2}|n|r|t|0|\\)/g, (_m, g: string) => {
    switch (g[0]) {
      case 'x':
        return String.fromCharCode(parseInt(g.slice(1), 16));
      case 'n':
        return '\n';
      case 'r':
        return '\r';
      case 't':
        return '\t';
      case '0':
        return '\0';
      default:
        return '\\';
    }
  });
}

/** Parse "AA BB 0C" / "aabb0c" style hex into bytes. */
export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/[^0-9a-fA-F]/g, '');
  const out = new Uint8Array(clean.length >> 1);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.substr(i * 2, 2), 16);
  return out;
}

export function bytesToHex(b: Uint8Array, sep = ' '): string {
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join(sep);
}

export function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  if (a.length === 0) return b;
  if (b.length === 0) return a;
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

/** Find `needle` in `hay` starting at `from`; -1 when absent. */
export function indexOfBytes(hay: Uint8Array, needle: Uint8Array, from = 0): number {
  if (needle.length === 0) return -1;
  const first = needle[0]!;
  outer: for (let i = from; i <= hay.length - needle.length; i++) {
    if (hay[i] !== first) continue;
    for (let j = 1; j < needle.length; j++) if (hay[i + j] !== needle[j]) continue outer;
    return i;
  }
  return -1;
}
