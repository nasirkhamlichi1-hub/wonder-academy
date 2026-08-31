// Screenshots of every screen, at a real viewport, against the harness.
// Looking at the thing is the only way to tell whether it looks like anything.

import { chromium } from 'playwright';

const b = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
});
const ctx = await b.newContext({
  viewport: { width: 1280, height: 900 },
  deviceScaleFactor: 2,
  permissions: ['microphone'],
});
const p = await ctx.newPage();
const errors = [];
p.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
p.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

const shot = async (name, opts = {}) => {
  await p.waitForTimeout(700);                       // let fonts and entrances settle
  await p.screenshot({ path: `/tmp/ui-${name}.png`, ...opts });
  console.log('  ✓', name);
};

const login = async (who, pin) => {
  await p.goto('http://127.0.0.1:8787/', { waitUntil: 'networkidle' });
  await p.evaluate(() => localStorage.clear());
  await p.reload({ waitUntil: 'networkidle' });
  await p.waitForSelector('.who__btn');
  await p.locator(`[data-child="${who}"]`).click();
  await p.waitForSelector('.pinpad');
  for (const d of pin) await p.locator(`[data-k="${d}"]`).click();
};

console.log('who + pin');
await p.goto('http://127.0.0.1:8787/', { waitUntil: 'networkidle' });
await p.waitForSelector('.who__btn');
await shot('01-who');
await p.locator('[data-child="sol"]').click();
await p.waitForSelector('.pinpad');
for (const d of '111') await p.locator(`[data-k="${d}"]`).click();
await shot('02-pin');

console.log('Sol');
await p.locator('[data-k="1"]').click();
await p.waitForSelector('.tile', { timeout: 10000 });
await shot('03-sol-home', { fullPage: true });

console.log('lesson');
await p.locator('#start1').click();
await p.waitForSelector('.board .v-title', { timeout: 15000 });
await shot('04-lesson');
await p.evaluate(() => document.querySelector('.phase-pip:nth-child(7)')?.click());
await shot('05-lesson-teachback');

console.log('Sophia');
await login('sophia', '3333');
await p.waitForSelector('.tile', { timeout: 10000 });
await shot('06-sophia-home', { fullPage: true });

console.log('Mission Control');
await login('__parent', '4321');
await p.waitForSelector('.stat', { timeout: 15000 });
await shot('07-mission-control', { fullPage: true });

console.log('mobile');
const m = await (await b.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2,
})).newPage();
await m.goto('http://127.0.0.1:8787/', { waitUntil: 'networkidle' });
await m.waitForSelector('.who__btn');
await m.locator('[data-child="isaac"]').click();
await m.waitForSelector('.pinpad');
for (const d of '2222') await m.locator(`[data-k="${d}"]`).click();
await m.waitForSelector('.tile', { timeout: 10000 });
await m.waitForTimeout(700);
await m.screenshot({ path: '/tmp/ui-08-mobile.png', fullPage: true });
console.log('  ✓ 08-mobile');

// Horizontal overflow is the classic way a bold layout breaks on a phone.
const overflow = await m.evaluate(() =>
  document.documentElement.scrollWidth - document.documentElement.clientWidth);
console.log(overflow > 1 ? `MOBILE OVERFLOW: ${overflow}px` : 'no mobile overflow');

console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no console/page errors');
await b.close();
