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
  await expect(page.locator('.rec')).toContainText('8 samples');
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
