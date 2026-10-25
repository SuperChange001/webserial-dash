import { expect, test, type Page } from '@playwright/test';
import { installFakeSerial } from './fake-serial';

declare global {
  interface Window {
    __fakeSerial: {
      feed(text: string): void;
      written(): string;
      opened(): number;
      options(): { baudRate: number };
      disconnect(): void;
    };
  }
}

async function openWithFakeSerial(page: Page, query = '?dashboard=demo-sensor') {
  await page.addInitScript(`(${installFakeSerial.toString()})()`);
  await page.goto(`/${query}`);
  await page.getByTestId('connect').click();
  await expect(page.getByTestId('status')).toContainText('connected');
}

test('connects through Web Serial, parses CSV and updates widgets', async ({ page }) => {
  await openWithFakeSerial(page);
  expect(await page.evaluate(() => window.__fakeSerial.options().baudRate)).toBe(115200);

  await page.evaluate(() => window.__fakeSerial.feed('85.5,41,3.91,1\n'));
  await expect(page.getByTestId('gauge-temp')).toHaveText('85.5 °C');
  await expect(page.getByTestId('value-hum')).toHaveText('41 %');
  await expect(page.getByTestId('value-vbat')).toHaveText('3.91 V');
  await expect(page.getByTestId('led-fan')).toHaveText('RUNNING');
  await expect(page.getByTestId('signal-count')).toHaveText('4 signals');

  // split frame across two chunks
  await page.evaluate(() => window.__fakeSerial.feed('20.'));
  await page.evaluate(() => window.__fakeSerial.feed('1,50,3.50,0\n'));
  await expect(page.getByTestId('gauge-temp')).toHaveText('20.1 °C');
  await expect(page.getByTestId('led-fan')).toHaveText('STOPPED');

  // terminal shows raw bytes (xterm renders rows into the DOM)
  await expect(page.locator('.w-terminal__xterm')).toContainText('85.5,41,3.91,1');
});

test('button widget sends commands with line ending', async ({ page }) => {
  await openWithFakeSerial(page);
  await page.getByRole('button', { name: 'Fan ON' }).click();
  await page.getByRole('button', { name: 'Status' }).click();
  await expect.poll(() => page.evaluate(() => window.__fakeSerial.written())).toBe('fan 1\nstatus\n');
});

test('records samples and exports CSV', async ({ page }) => {
  await openWithFakeSerial(page);
  await page.getByTestId('rec-start').click();
  await page.evaluate(() => window.__fakeSerial.feed('21,40,3.7,0\n22,41,3.7,1\n'));
  await expect(page.getByTestId('rec-status')).toContainText('8 samples');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV' }).click();
  const path = await (await download).path();
  const { readFileSync } = await import('node:fs');
  const csv = readFileSync(path!, 'utf8').trim().split('\n');
  expect(csv[0]).toBe('timestamp_ms,iso_time,temp,hum,vbat,fan');
  expect(csv).toHaveLength(3);
  expect(csv[1]!.endsWith(',21,40,3.7,0')).toBe(true);
});

test('device loss shows error status and allows reconnect', async ({ page }) => {
  await openWithFakeSerial(page);
  await page.evaluate(() => window.__fakeSerial.disconnect());
  await expect(page.getByTestId('status')).toHaveText('error');
  // After a device loss the bar offers Connect again; reconnecting replaces the dead transport.
  await page.getByTestId('connect').click();
  await expect(page.getByTestId('status')).toContainText('connected');
  expect(await page.evaluate(() => window.__fakeSerial.opened())).toBe(2);
});

test('demo mode runs the simulated device without hardware', async ({ page }) => {
  await page.goto('/?dashboard=teleplot&demo');
  await expect(page.getByTestId('status')).toContainText('connected');
  await expect(page.getByTestId('signal-count')).toHaveText('3 signals');
  await expect(page.getByTestId('table-sin')).not.toHaveText('—');
});

test('switching dashboards swaps parser and widgets', async ({ page }) => {
  await openWithFakeSerial(page, '?dashboard=esp-log');
  await page.evaluate(() => window.__fakeSerial.feed('I (1) sensor: T=23.5C H=41% V=3.70\nW (2) wifi: retry\n'));
  await expect(page.getByTestId('value-temp')).toHaveText('23.5 °C');
  await expect(page.locator('.w-log__lines')).toContainText('W (2) wifi: retry');
  await expect(page.locator('.w-log__lines')).not.toContainText('sensor');
});

test('quick start: names come from the firmware and widgets are generated', async ({ page }) => {
  await openWithFakeSerial(page, '?dashboard=quickstart');
  await page.evaluate(() => window.__fakeSerial.feed('booting...\nticks=100 temp=21.5 hum=40\nticks=200 temp=21.6 hum=41 co2=612\n'));
  await expect(page.getByTestId('value-temp')).toHaveText('21.6');
  await expect(page.getByTestId('value-co2')).toHaveText('612');
  // the tick counter is recorded but not given a tile
  await expect(page.getByTestId('value-ticks')).toHaveCount(0);
  await expect(page.getByTestId('signal-count')).toHaveText('4 signals');
});

test('logs to a file in browser storage and downloads it', async ({ page }) => {
  await page.addInitScript(() => {
    delete (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker;
  });
  await openWithFakeSerial(page, '?dashboard=quickstart');
  await page.getByTestId('file-log-start').click();
  await expect(page.getByTestId('file-log-status')).toContainText('FILE');
  await page.evaluate(() => window.__fakeSerial.feed('ticks=100 temp=1\nticks=200 temp=2\n'));
  await expect(page.getByTestId('file-log-status')).toContainText('2 rows');
  await page.getByTestId('file-log-stop').click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download log' }).click();
  const { readFileSync } = await import('node:fs');
  const csv = readFileSync((await (await download).path())!, 'utf8').trim().split('\n');
  expect(csv[0]).toBe('timestamp_ms,iso_time,ticks,temp');
  expect(csv).toHaveLength(3);
  expect(csv[2]!.endsWith(',200,2')).toBe(true);
});

test('wifi example: start test fills gauges and history, clean data empties them', async ({ page }) => {
  await page.goto('/?dashboard=wifi-speedtest&demo');
  await expect(page.getByTestId('status')).toContainText('connected');
  await expect(page.getByTestId('gauge-rssi')).toContainText('dBm');
  await expect(page.getByTestId('gauge-minmax-rssi')).toContainText(/min -\d+ dBm/);
  await expect(page.getByTestId('gauge-down_mbps')).toHaveText('—');

  await page.getByRole('button', { name: 'Start test' }).click();
  await expect(page.getByTestId('gauge-down_mbps')).toContainText('Mbit/s');
  await expect(page.getByTestId('value-ping_ms')).toContainText('ms');
  await expect(page.locator('.w-log__lines')).toContainText('down_mbps=');

  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'Clean data' }).click();
  await expect(page.getByTestId('gauge-down_mbps')).toHaveText('—');
  await expect(page.getByTestId('gauge-minmax-down_mbps')).toHaveText('min —max —');
});
