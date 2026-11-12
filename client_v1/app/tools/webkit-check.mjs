/**
 * WebKit(Playwright)でのレンダリング確認スクリプト。
 * 各画面のスクリーンショット + コンソールエラー収集 + 縦スクロール月タイトル追従の検査。
 *
 * 使い方: node tools/webkit-check.mjs
 * 環境変数: ORBIT_COOKIE(session_id の値)
 */
import fs from 'node:fs';
import { webkit } from 'playwright';

const BASE = process.env.ORBIT_BASE_URL ?? 'http://localhost:5173';
const COOKIE = process.env.ORBIT_COOKIE;
const OUT = '/tmp/webkit-shots';
fs.mkdirSync(OUT, { recursive: true });

const browser = await webkit.launch({ headless: true, executablePath: webkit.executablePath() });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
if (COOKIE) await ctx.addCookies([{ name: 'session_id', value: COOKIE, domain: 'localhost', path: '/' }]);
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text().slice(0, 250));
});
page.on('pageerror', (e) => errors.push(`PAGEERROR ${String(e).slice(0, 250)}`));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const switchView = async (trigger, label) => {
  await page.evaluate((t) => {
    const b = [...document.querySelectorAll('button[aria-label]')].find((b) => b.getAttribute('aria-label') === t);
    if (b) b.click();
  }, trigger);
  await sleep(400);
  const ok = await page.evaluate((l) => {
    const b = [...document.querySelectorAll('button, [role="menuitem"]')].find((b) => (b.getAttribute('aria-label') || b.textContent.trim()).includes(l));
    if (b) { b.click(); return true; }
    return false;
  }, label);
  await sleep(2000);
  return ok;
};

await page.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 });
await sleep(3500);
await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => /Close|閉じる/.test(b.getAttribute('aria-label') || b.title || ''))?.click());
await sleep(500);
await page.screenshot({ path: `${OUT}/01-month.png` });

// 縦スクロール表示へ切替
console.log('vertical switch:', await switchView('月表示の操作', 'スクロール表示'));
await sleep(1000);
await page.screenshot({ path: `${OUT}/02-vertical.png` });

// 縦スクロールで月タイトルの追従を検査
const vdump = () => page.evaluate(() => {
  const sc = document.querySelector('.vertical-scroll');
  if (!sc) return null;
  const cells = [...sc.querySelectorAll('.day-cell')];
  const threshold = sc.scrollTop + (sc.querySelector('.month-header')?.offsetHeight ?? 0) + 1;
  const top = cells.find((c) => c.offsetTop + c.offsetHeight > threshold);
  return { st: Math.round(sc.scrollTop), title: document.querySelector('.month-toolbar h1')?.textContent?.trim(), topDate: top?.getAttribute('data-date') };
});
console.log('v0:', JSON.stringify(await vdump()));
for (let i = 0; i < 6; i++) {
  await page.evaluate(() => { document.querySelector('.vertical-scroll').scrollTop += 400; });
  await sleep(700);
  console.log(`down#${i + 1}:`, JSON.stringify(await vdump()));
}
for (let i = 0; i < 6; i++) {
  await page.evaluate(() => { document.querySelector('.vertical-scroll').scrollTop -= 400; });
  await sleep(700);
  console.log(`up#${i + 1}:`, JSON.stringify(await vdump()));
}
await page.screenshot({ path: `${OUT}/02b-vertical-scrolled.png` });

// タイムライン表示
console.log('week switch:', await switchView('月表示の操作', 'TL表示'));
await page.screenshot({ path: `${OUT}/03-week.png` });

// 各画面遷移
for (const [name, path] of [
  ['05-config', '/usr/config'],
  ['06-share', '/cal/share'],
  ['07-search', '/evt/search'],
]) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 60000 });
  await sleep(2000);
  await page.screenshot({ path: `${OUT}/${name}.png` });
}

// モバイル幅
await ctx.close();
const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
if (COOKIE) await ctx2.addCookies([{ name: 'session_id', value: COOKIE, domain: 'localhost', path: '/' }]);
const mp = await ctx2.newPage();
mp.on('console', (m) => { if (m.type() === 'error') errors.push(`mobile: ${m.text().slice(0, 250)}`); });
mp.on('pageerror', (e) => errors.push(`mobile PAGEERROR ${String(e).slice(0, 250)}`));
await mp.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 });
await sleep(3500);
await mp.screenshot({ path: `${OUT}/08-mobile-month.png` });
const docW = await mp.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
if (docW.sw > docW.iw + 2) console.log(`[layout:mobile] 横スクロール: ${docW.sw} > ${docW.iw}`);

console.log('\n=== console errors ===');
const uniq = [...new Set(errors)];
uniq.forEach((e) => console.log(e));
console.log(`(${uniq.length} unique errors)`);
await browser.close();
