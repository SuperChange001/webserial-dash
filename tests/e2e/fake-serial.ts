/**
 * Injected into the page before load (Playwright addInitScript). Must be self-contained:
 * no imports, no outer-scope references — it is serialised with Function.toString().
 * Installs a fake `navigator.serial` whose requestPort() resolves to an in-memory port and
 * exposes `window.__fakeSerial` so tests can feed bytes and read what the app wrote.
 */
export function installFakeSerial() {
  type Ctrl = ReadableStreamDefaultController<Uint8Array>;
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const state = { written: [] as string[], opened: 0, options: null as unknown, ctrl: null as Ctrl | null, ports: [] as unknown[] };
  class FakePort extends EventTarget {
    readable: ReadableStream<Uint8Array> | null = null;
    writable: WritableStream<Uint8Array> | null = null;
    async open(options: unknown) {
      state.opened++;
      state.options = options;
      this.readable = new ReadableStream<Uint8Array>({
        start: (c) => {
          state.ctrl = c;
        },
        cancel: () => {
          state.ctrl = null;
        },
      });
      this.writable = new WritableStream<Uint8Array>({ write: (chunk) => void state.written.push(dec.decode(chunk)) });
    }
    async close() {
      state.ctrl?.close();
      state.ctrl = null;
      this.readable = null;
      this.writable = null;
    }
    getInfo() {
      return { usbVendorId: 0x303a, usbProductId: 0x1001 };
    }
    async setSignals() {}
    async forget() {}
  }
  const port = new FakePort();
  const serial = {
    requestPort: async () => port,
    getPorts: async () => [port],
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  Object.defineProperty(Navigator.prototype, 'serial', { configurable: true, get: () => serial });
  // Native save dialogs cannot be driven by Playwright; force the <a download> fallback.
  Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: undefined });
  (window as unknown as { __fakeSerial: unknown }).__fakeSerial = {
    feed: (text: string) => {
      if (!state.ctrl) throw new Error('port not open');
      state.ctrl.enqueue(enc.encode(text));
    },
    written: () => state.written.join(''),
    opened: () => state.opened,
    options: () => state.options,
    disconnect: () => {
      state.ctrl?.error(new DOMException('The device has been lost.', 'NetworkError'));
      state.ctrl = null;
      port.dispatchEvent(new Event('disconnect'));
    },
  };
}
