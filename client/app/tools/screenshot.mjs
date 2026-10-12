#!/usr/bin/env node
/**
 * Orbit Calendar 本番環境のスクリーンショット撮影スクリプト。
 * ログイン済み Cookie を /tmp/orbit-cookie.txt から読み込み、
 * 各画面を撮影して docs/assets/ へ保存する。
 *
 * 使い方:
 *   node tools/screenshot.mjs            # 全ショット撮影
 *   node tools/screenshot.mjs <keyword>  # 名前に keyword を含むショットのみ撮影
 *
 * 環境変数:
 *   ORBIT_BASE_URL     撮影対象 (default: https://orbit.proxaxis.me)
 *   ORBIT_COOKIE_FILE  Cookie ファイル (default: /tmp/orbit-cookie.txt)
 *   ORBIT_SHOT_DIR     出力先 (default: docs/assets)
 *
 * Cookie ファイルの形式:
 *   - JSON 配列: [{ "name": "...", "value": "...", "domain": "...", "path": "...", ... }]
 *   - Netscape 形式 (curl -c / ブラウザエクスポート): domain\tflag\tpath\tsecure\texpiry\tname\tvalue
 *   - ヘッダ文字列: "name=value; name2=value2"
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer';

const BASE_URL = (process.env.ORBIT_BASE_URL || 'https://orbit.proxaxis.me').replace(/\/+$/, '');
const COOKIE_FILE = process.env.ORBIT_COOKIE_FILE || '/tmp/orbit-cookie.txt';
const OUT_DIR = process.env.ORBIT_SHOT_DIR || new URL('../docs/assets/', import.meta.url).pathname;
const FILTER = process.argv[2] || '';

const DESKTOP = { width: 1440, height: 900, deviceScaleFactor: 1 };
const MOBILE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

/* ---------------------------------- Cookie ---------------------------------- */

/** @returns {Promise<object[]>} Puppeteer に渡す Cookie 一覧 */
async function loadCookies() {
  let raw;
  try {
    raw = await fs.readFile(COOKIE_FILE, 'utf8');
  } catch {
    console.warn(`Cookie file not found: ${COOKIE_FILE} (未ログインで撮影)`);
    return [];
  }
  const text = raw.trim();
  if (!text) return [];

  // JSON 形式
  if (text.startsWith('[') || text.startsWith('{')) {
    const data = JSON.parse(text);
    const arr = Array.isArray(data) ? data : [data];
    return arr.map((c) => ({ url: BASE_URL, ...c }));
  }

  // Netscape 形式 (タブ区切り、# コメント行あり)
  if (text.includes('\t')) {
    const host = new URL(BASE_URL).hostname;
    return text
      .split('\n')
      .filter((line) => line.trim() && !line.startsWith('# '))
      .map((line) => {
        const cols = line.split('\t');
        if (cols.length < 7) return null;
        const [domain, , cookiePath, , expiry, name, value] = cols;
        const cookie = { name: name.trim(), value: value.trim(), domain: domain.trim(), path: cookiePath || '/' };
        if (Number(expiry) > 0) cookie.expires = Number(expiry);
        // HttpOnly(#HttpOnly_ プレフィックス)は剥がす
        cookie.domain = cookie.domain.replace(/^#HttpOnly_/, '');
        if (!cookie.domain.includes(host)) cookie.url = BASE_URL;
        return cookie;
      })
      .filter(Boolean);
  }

  // "name=value; name2=value2" 形式
  // BFF が別サブドメイン(bff-*)にあるため、親ドメイン(.proxaxis.me)で設定する
  const hostname = new URL(BASE_URL).hostname;
  const parentDomain = hostname.includes('.') ? `.${hostname.split('.').slice(-2).join('.')}` : null;
  return text
    .split(/;\s*/)
    .filter(Boolean)
    .map((pair) => {
      const idx = pair.indexOf('=');
      const cookie = { name: pair.slice(0, idx).trim(), value: pair.slice(idx + 1).trim() };
      if (parentDomain) {
        cookie.domain = parentDomain;
        cookie.path = '/';
        if (BASE_URL.startsWith('https:')) cookie.secure = true;
      } else {
        cookie.url = BASE_URL;
      }
      return cookie;
    });
}

/* --------------------------------- helpers --------------------------------- */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Web フォントの読み込み完了を待つ(コンテナに CJK フォントが無いため必須) */
async function waitFonts(page) {
  await page.evaluate(() => document.fonts?.ready?.catch(() => {})).catch(() => {});
  await sleep(400);
}

/** ページ遷移して落ち着くまで待つ */
async function goto(page, p, { settle = 2200 } = {}) {
  await page.goto(`${BASE_URL}${p}`, { waitUntil: 'networkidle2', timeout: 90_000 });
  await waitFonts(page);
  await sleep(settle);
}

/** セレクタが現れるまで待ってからクリック */
async function click(page, selector, { delay = 1200 } = {}) {
  await page.waitForSelector(selector, { timeout: 30_000 });
  await page.click(selector);
  await sleep(delay);
}

/** 指定 title のボタンをクリック */
async function clickTitle(page, title, opts) {
  return click(page, `[title="${title}"]`, opts);
}

/** 指定 aria-label のボタンをクリック */
async function clickLabel(page, label, opts) {
  return click(page, `[aria-label="${label}"]`, opts);
}

/**
 * 現在が週/縦スクロール表示なら月表示へ戻す。
 * ビュー切替はユーザ設定に永続化されるため、月表示前提のショットでは必ず呼ぶ。
 */
async function ensureMonthView(page) {
  const btn = await page.$('[aria-label="月表示にする"]');
  if (btn) {
    await btn.click();
    await sleep(1500);
  }
}

/* --------------------------------- ショット一覧 --------------------------------- */

/**
 * @typedef {Object} Shot
 * @property {string} name 出力ファイル名 (拡張子不要)
 * @property {object} [viewport] ビューポート (default: DESKTOP)
 * @property {(page: import('puppeteer').Page) => Promise<void>} run 撮影までの操作
 */

/** @type {Shot[]} */
const SHOTS = [
  {
    name: '10-home-month',
    run: async (page) => {
      await goto(page, '/');
      await ensureMonthView(page);
      await page.waitForSelector('.home-zone', { timeout: 60_000 });
      await sleep(1500);
    },
  },
  {
    name: '11-home-month-vertical',
    run: async (page) => {
      await goto(page, '/');
      await ensureMonthView(page);
      await clickLabel(page, '縦スクロール表示にする');
      await sleep(1500);
    },
  },
  {
    name: '12-home-week-timeline',
    run: async (page) => {
      await goto(page, '/');
      await ensureMonthView(page);
      await clickLabel(page, 'タイムライン表示にする');
      await sleep(1500);
    },
  },
  {
    name: '13-home-month-restore',
    run: async (page) => {
      // 週→月に戻す (ユーザ設定を元に戻すための遷移。マニュアルには使わない想定)
      await goto(page, '/');
      await ensureMonthView(page);
      await sleep(1200);
    },
  },
  {
    name: '20-event-detail',
    run: async (page) => {
      await goto(page, '/');
      await ensureMonthView(page);
      await page.waitForSelector('.event-bar', { timeout: 60_000 });
      await page.click('.event-bar');
      await sleep(2500);
    },
  },
  {
    name: '21-event-editor',
    run: async (page) => {
      await goto(page, '/');
      await ensureMonthView(page);
      await page.waitForSelector('.event-bar', { timeout: 60_000 });
      await page.click('.event-bar');
      await sleep(2000);
      await clickTitle(page, 'Edit');
      await sleep(2000);
    },
  },
  {
    name: '22-event-creator',
    run: async (page) => {
      await goto(page, '/evt/new');
      await sleep(1500);
    },
  },
  {
    name: '23-event-cloner',
    run: async (page) => {
      await goto(page, '/');
      await ensureMonthView(page);
      await page.waitForSelector('.event-bar', { timeout: 60_000 });
      await page.click('.event-bar');
      await sleep(2000);
      await clickTitle(page, '複製');
      await sleep(2000);
    },
  },
  {
    name: '24-event-search',
    run: async (page) => {
      await goto(page, '/evt/search');
      await page.waitForSelector('input[type="search"]', { timeout: 30_000 });
      await page.type('input[type="search"]', 'MTG', { delay: 40 });
      await clickLabel(page, '検索');
      // BFF キュー経由のため結果が返るまで待つ
      await page.waitForSelector('.search-results', { timeout: 60_000 });
      await sleep(1500);
    },
  },
  {
    name: '25-quick-add',
    run: async (page) => {
      await goto(page, '/evt/quick-add');
      await sleep(1500);
    },
  },
  {
    name: '26-event-templates',
    run: async (page) => {
      await goto(page, '/evt/templates');
      await sleep(1500);
    },
  },
  {
    name: '30-share-manage',
    run: async (page) => {
      await goto(page, '/cal/share');
      await sleep(1500);
    },
  },
  {
    name: '31-sharing-config',
    run: async (page) => {
      await goto(page, '/cal/sharing');
      await sleep(1500);
    },
  },
  {
    name: '32-calendar-creator',
    run: async (page) => {
      await goto(page, '/cal/new');
      await sleep(1500);
    },
  },
  {
    name: '33-calendar-adder',
    run: async (page) => {
      await goto(page, '/cal/add');
      await sleep(1500);
    },
  },
  {
    name: '40-user-config',
    run: async (page) => {
      await goto(page, '/usr/config');
      await sleep(1800);
    },
  },
  {
    name: '50-context-menu',
    run: async (page) => {
      await goto(page, '/');
      await ensureMonthView(page);
      await page.waitForSelector('.month-cell, .day-cell, [class*="cell"]', { timeout: 60_000 });
      const cell = await page.$('.month-cell') || (await page.$$('.day-cell'))?.[0];
      if (cell) {
        const box = await cell.boundingBox();
        if (box) {
          await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });
          await sleep(1200);
        }
      }
    },
  },
  // ---- モバイル ----
  {
    name: '60-mobile-home',
    viewport: MOBILE,
    run: async (page) => {
      await goto(page, '/');
      await page.waitForSelector('.home-zone', { timeout: 60_000 });
      await sleep(1500);
    },
  },
  {
    name: '61-mobile-event-detail',
    viewport: MOBILE,
    run: async (page) => {
      await goto(page, '/');
      // モバイルでは下部シートのイベントカードをタップすると詳細が開く
      await page.waitForSelector('li:has(> .face)', { timeout: 60_000 });
      await page.tap('li:has(> .face)');
      await sleep(2500);
    },
  },
  {
    name: '41-user-config-display-section',
    run: async (page) => {
      await goto(page, '/usr/config');
      await sleep(1000);
      // 「表示」アコーディオンを展開
      await page.evaluate(() => {
        const summary = [...document.querySelectorAll('.accordion-menu summary .summary-label')].find((el) => el.textContent.trim() === '表示');
        summary?.closest('summary')?.click();
      });
      await sleep(1500);
    },
  },
  {
    name: '70-login-dialog',
    viewport: DESKTOP,
    incognito: true,
    run: async (page) => {
      // Cookie なし状態で開きログイン促進ダイアログを撮る
      await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle2', timeout: 90_000 });
      await waitFonts(page);
      await sleep(3000);
    },
  },
];

/* ---------------------------------- main ---------------------------------- */

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const cookies = await loadCookies();
  console.log(`Cookies loaded: ${cookies.length}`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--lang=ja-JP'],
  });

  try {
    const page = await browser.newPage();
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'ja-JP,ja;q=0.9' });
    if (cookies.length) {
      // url 指定の Cookie と domain 指定の Cookie を分けて setCookie へ渡す
      await page.setCookie(...cookies);
    }

    const targets = SHOTS.filter((s) => s.name.includes(FILTER));
    for (const shot of targets) {
      const vp = shot.viewport ?? DESKTOP;
      let shotPage = page;
      let ctx = null;
      if (shot.incognito) {
        // Cookie の無い別コンテキストで未ログイン状態を撮る
        ctx = await browser.createBrowserContext();
        shotPage = await ctx.newPage();
        await shotPage.setExtraHTTPHeaders({ 'Accept-Language': 'ja-JP,ja;q=0.9' });
      }
      await shotPage.setViewport(vp);
      try {
        await shot.run(shotPage);
        const file = path.join(OUT_DIR, `${shot.name}.png`);
        await shotPage.screenshot({ path: file });
        console.log(`saved: ${file}`);
      } catch (err) {
        console.error(`FAILED ${shot.name}: ${err.message}`);
      } finally {
        if (ctx) await ctx.close();
      }
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
