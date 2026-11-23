#!/usr/bin/env node
/**
 * Google OAuth 検証向けデモ動画の自動収録スクリプト (Playwright Chromium)。
 * ログイン済み Cookie を /tmp/orbit-cookie.txt から読み込み、
 * スコープを使う機能をシーンごとに操作して webm 動画として保存する。
 *
 * 使い方:
 *   node tools/oauth-demo-video.mjs            # 全シーン収録
 *   node tools/oauth-demo-video.mjs <keyword>  # 名前に keyword を含むシーンのみ収録
 *
 * 環境変数:
 *   ORBIT_BASE_URL            収録対象 (default: https://orbit.proxaxis.me)
 *   ORBIT_COOKIE_FILE         Cookie ファイル (default: /tmp/orbit-cookie.txt)
 *   ORBIT_VIDEO_DIR           出力先 (default: oauth-demo-recordings/)
 *   ORBIT_DEMO_SHARE_WITH     ACL デモで共有する相手のメールアドレス (未設定なら追加しない)
 *   ORBIT_DEMO_KEEP_SHARE     "1" で追加した共有ルールを残す (default: 削除する)
 *   ORBIT_DEMO_CONTACT_QUERY  招待者サジェストの検索語 (default: "proxaxis")
 *   ORBIT_DEMO_OTHER_QUERY    「その他の連絡先」側の検索語 (default: "hosoda")
 *   ORBIT_DEMO_EVENT_TITLE    作成するデモイベントのタイトル
 *
 * 収録されないシーン (台本 docs/OAUTH_DEMO_VIDEO.md 参照):
 *   - OAuth 同意画面 (再認可が必要なため手動収録)
 *   - Google Photos Picker (Google ログイン済みブラウザが必要なため手動収録)
 *   - calendar.google.com / photos.google.com での反映確認 (手動収録)
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const BASE_URL = (process.env.ORBIT_BASE_URL || 'https://orbit.proxaxis.me').replace(/\/+$/, '');
const COOKIE_FILE = process.env.ORBIT_COOKIE_FILE || '/tmp/orbit-cookie.txt';
const OUT_DIR = path.resolve(process.env.ORBIT_VIDEO_DIR || new URL('../oauth-demo-recordings/', import.meta.url).pathname);
const FILTER = process.argv[2] || '';
const SHARE_WITH = process.env.ORBIT_DEMO_SHARE_WITH || '';
const KEEP_SHARE = process.env.ORBIT_DEMO_KEEP_SHARE === '1';
const CONTACT_QUERY = process.env.ORBIT_DEMO_CONTACT_QUERY || 'proxaxis';
const OTHER_CONTACT_QUERY = process.env.ORBIT_DEMO_OTHER_QUERY || 'hosoda';
const EVENT_TITLE = process.env.ORBIT_DEMO_EVENT_TITLE || 'OAuth demo event';

const VIEWPORT = { width: 1280, height: 800 };

/* ---------------------------------- Cookie ---------------------------------- */

/** @returns {Promise<object[]>} Playwright の addCookies に渡す Cookie 一覧 */
async function loadCookies() {
  let raw;
  try {
    raw = await fs.readFile(COOKIE_FILE, 'utf8');
  } catch {
    console.warn(`Cookie file not found: ${COOKIE_FILE} (未ログインで収録)`);
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
      const cookie = { name: pair.slice(0, idx).trim(), value: pair.slice(idx + 1).trim(), path: '/' };
      if (parentDomain) {
        cookie.domain = parentDomain;
        if (BASE_URL.startsWith('https:')) cookie.secure = true;
      } else {
        cookie.url = BASE_URL;
      }
      return cookie;
    });
}

/* --------------------------------- helpers --------------------------------- */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Web フォントの読み込み完了を待つ */
async function waitFonts(page) {
  await page.evaluate(() => document.fonts?.ready?.catch(() => {})).catch(() => {});
  await sleep(400);
}

/** ページ遷移して落ち着くまで待つ */
async function goto(page, p, { settle = 2500 } = {}) {
  await page.goto(`${BASE_URL}${p}`, { waitUntil: 'networkidle', timeout: 90_000 });
  await waitFonts(page);
  await sleep(settle);
}

/** ゆっくり文字を打つ (デモ動画で入力操作が見える速度) */
async function type(page, selector, text) {
  await page.waitForSelector(selector, { timeout: 30_000 });
  await page.click(selector);
  await page.locator(selector).pressSequentially(text, { delay: 90 });
  await sleep(800);
}

/**
 * SPA 内部でページ遷移する (ストアのメモリ状態を保持するため page.goto しない)。
 * Vue Router は popstate を監視するので pushState + PopStateEvent で遷移できる。
 * @param {string} p 遷移先パス
 */
async function spaNavigate(page, p) {
  await page.evaluate((path) => {
    history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, p);
  await waitFonts(page);
  await sleep(2500);
}

/** 現在が週/縦スクロール表示なら月表示へ戻す */
async function ensureMonthView(page) {
  const btn = page.locator('[aria-label="月表示にする"]');
  if (await btn.count()) {
    await btn.first().click();
    await sleep(1500);
  }
}

/** 確認ダイアログの YES を押す */
async function confirmDialog(page) {
  await page.waitForSelector('dialog[open] .confirm-button', { timeout: 15_000 });
  await page.click('dialog[open] .confirm-button');
  await sleep(2000);
}

/** イベントフォームの「詳細設定」アコーディオンを開く (招待者欄・写真アルバム欄はこの中) */
async function openDetailsAccordion(page) {
  const summary = page.locator('.accordion-menu summary', { hasText: '詳細設定' });
  await summary.waitFor({ timeout: 30_000 });
  await summary.click();
  await sleep(1500);
}

/* --------------------------------- シーン一覧 --------------------------------- */

/**
 * @typedef {Object} Scene
 * @property {string} name 出力ファイル名 (拡張子不要)
 * @property {(page: import('playwright').Page) => Promise<void>} run 収録する操作
 */

/** @type {Scene[]} */
const SCENES = [
  {
    // auth/calendar: calendarList.list で取得したカレンダー一覧の表示
    name: '01-calendar-list',
    run: async (page) => {
      await goto(page, '/');
      await ensureMonthView(page);
      await page.waitForSelector('.home-zone', { timeout: 60_000 });
      await sleep(3000);
    },
  },
  {
    // auth/calendar: ACL の読み取り + 共有相手の追加 (acl.insert) + 削除 (acl.delete)
    name: '02-acl-sharing',
    run: async (page) => {
      await goto(page, '/cal/sharing');
      await page.waitForSelector('.sharing', { timeout: 60_000 });
      await sleep(2000);
      if (!SHARE_WITH) {
        console.warn('  ORBIT_DEMO_SHARE_WITH 未設定のため ACL 追加はスキップ (既存ルール表示のみ)');
        await sleep(1500);
        return;
      }
      await type(page, '.sharing input[placeholder="name@example.com"]', SHARE_WITH);
      await page.click('.sharing button[type="submit"]');
      await sleep(3000);
      if (!KEEP_SHARE) {
        // 追加したルールを削除してアカウントを元に戻す (acl.delete も実演になる)
        const deleteButtons = page.locator('button[title="共有設定を削除"]');
        const count = await deleteButtons.count();
        if (count > 0) {
          await deleteButtons.last().click();
          await confirmDialog(page);
        }
      }
      await sleep(1500);
    },
  },
  {
    // 予定の作成・表示・削除 (イベント書き込みの実演。calendar.events + 作成物の Google 側反映確認の布石)
    name: '03-event-crud',
    run: async (page) => {
      await goto(page, '/evt/new');
      await type(page, '[aria-label="タイトル"]', EVENT_TITLE);
      await page.click('button[type="submit"]');
      await sleep(4000);
      // 詳細画面で削除ボタンが出るのを確認してから削除
      await page.waitForSelector('button[title="Delete"]', { timeout: 60_000 });
      await sleep(2000);
      await page.click('button[title="Delete"]');
      await confirmDialog(page);
      await sleep(2000);
    },
  },
  {
    // contacts.readonly + contacts.other.readonly: 招待者入力のサジェスト.
    // 登録済み連絡先の検索語 → 「その他の連絡先」の検索語の順に入力して両スコープを実演する.
    name: '04-contacts-suggest',
    run: async (page) => {
      // 連絡先連携はオプトインで設定は IndexedDB 保存のため, 新規コンテキストでは無効.
      // /authorized?t=people で userStore.usePeopleApi をメモリ上で立ててから SPA 内遷移する.
      await goto(page, '/authorized?t=people');
      await sleep(2000);
      await spaNavigate(page, '/evt/new');
      await openDetailsAccordion(page);
      // People API の検索結果がプルダウンに出るのを待つ (BFF キュー経由で数秒かかることがある).
      // 空状態(.suggest-status)ではなく, クエリ文字列を含む実際の候補ボタン行を待つ
      const waitSuggestion = async (matchText) => {
        try {
          await page.waitForSelector(`.suggest-list li:not(.suggest-status) button:has-text("${matchText}")`, { timeout: 60_000 });
        } catch {
          console.warn(`  サジェスト候補が出ませんでした: "${matchText}" (クエリを変えて再収録してください)`);
        }
      };
      // contacts.readonly: 登録済み連絡先の候補
      await type(page, '#attendee-query', CONTACT_QUERY);
      await waitSuggestion(CONTACT_QUERY);
      await sleep(3000);
      // contacts.other.readonly: 「その他の連絡先」候補 (その他の連絡先バッジが出る)
      await page.locator('#attendee-query').press('ControlOrMeta+a');
      await page.locator('#attendee-query').pressSequentially(OTHER_CONTACT_QUERY, { delay: 90 });
      await waitSuggestion(OTHER_CONTACT_QUERY);
      await sleep(3000);
    },
  },
  {
    // photoslibrary.appendonly: 予定保存時に Google フォトアルバムを作成し、
    // ローカルファイルをアップロードする (uploads + mediaItems:batchCreate)
    name: '05-photos-upload',
    run: async (page) => {
      // 小さなデモ用 PNG を生成してアップロードする
      const pngPath = path.join(OUT_DIR, 'demo-photo.png');
      const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAATSURBVBhXY/iPA4YMmILh/wcAgP//AUr9G1d9H0i4AAAAAElFTkSuQmCC', 'base64');
      await fs.writeFile(pngPath, png);

      await goto(page, '/evt/new');
      await type(page, '[aria-label="タイトル"]', `${EVENT_TITLE} album`);
      await openDetailsAccordion(page);
      // 写真共有が未許可だとアルバム欄自体が描画されない
      const albumCheck = page.locator('.photo-album-check input[type="checkbox"]');
      if (!(await albumCheck.count())) {
        console.warn('  写真共有が無効または未認可のためアルバム作成をスキップ (個人設定で有効化してから再収録)');
        return;
      }
      await albumCheck.check();
      await sleep(1000);
      await page.click('button[type="submit"]');
      await sleep(5000);
      // アルバムが作成されると詳細画面に写真アルバム欄が出る
      await page.waitForSelector('.photos-section', { timeout: 90_000 });
      await sleep(1500);
      // 隠し file input に直接ファイルを流し込むとアップロードが始まる
      await page.setInputFiles('.photos-section input[type="file"]', pngPath);
      // グリッドにサムネイルが出るまで待つ
      await page.waitForSelector('.photo-grid', { timeout: 120_000 });
      await sleep(3000);
    },
  },
];

/* ---------------------------------- main ---------------------------------- */

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const cookies = await loadCookies();
  console.log(`Cookies loaded: ${cookies.length}`);
  console.log(`Output dir: ${OUT_DIR}`);

  const browser = await chromium.launch({
    headless: true,
    args: ['--lang=ja-JP'],
  });

  const saved = [];
  try {
    const targets = SCENES.filter((s) => s.name.includes(FILTER));
    for (const scene of targets) {
      // シーンごとにコンテキストを分けて個別の webm にする (並べ替え・トリミングが容易)
      const ctx = await browser.newContext({
        viewport: VIEWPORT,
        locale: 'ja-JP',
        recordVideo: { dir: OUT_DIR, size: VIEWPORT },
      });
      const page = await ctx.newPage();
      await page.setExtraHTTPHeaders({ 'Accept-Language': 'ja-JP,ja;q=0.9' });
      if (cookies.length) await ctx.addCookies(cookies);
      try {
        console.log(`recording: ${scene.name}`);
        await scene.run(page);
      } catch (err) {
        console.error(`FAILED ${scene.name}: ${err.message}`);
      } finally {
        const video = page.video();
        await ctx.close();
        if (video) {
          const rawPath = await video.path();
          const dest = path.join(OUT_DIR, `${scene.name}.webm`);
          await fs.rename(rawPath, dest);
          saved.push(dest);
          console.log(`saved: ${dest}`);
        }
      }
    }
  } finally {
    await browser.close();
  }
  console.log(`\n${saved.length} clips saved.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
