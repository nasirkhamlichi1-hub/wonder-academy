import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await b.newPage();
const errors = [];
p.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
p.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

await p.goto('http://127.0.0.1:8787/', { waitUntil: 'networkidle' });
await p.waitForSelector('.who__btn', { timeout: 10000 });
console.log('login screen:', await p.locator('h1').textContent());
console.log('choices:', await p.locator('.who__btn').allInnerTexts());

await p.locator('[data-child="sol"]').click();
await p.waitForSelector('.pinpad');
for (const d of '1111') await p.locator(`[data-k="${d}"]`).click();
await p.waitForSelector('#start1', { timeout: 10000 });
console.log('child home h1:', await p.locator('h1').textContent());
console.log('tier attr:', await p.getAttribute('body', 'data-tier'));
await p.screenshot({ path: '/tmp/shot-child.png', fullPage: true });

// parent view
await p.locator('#signout').click();
await p.waitForSelector('.who__btn');
await p.locator('[data-child="__parent"]').click();
await p.waitForSelector('.pinpad');
for (const d of '4321') await p.locator(`[data-k="${d}"]`).click();
await p.waitForSelector('.card-grid', { timeout: 20000 });
console.log('parent h1:', await p.locator('h1').textContent());
console.log('panels:', (await p.locator('.card').count()), 'cards');
await p.screenshot({ path: '/tmp/shot-parent.png', fullPage: true });

console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no console/page errors');
await b.close();
