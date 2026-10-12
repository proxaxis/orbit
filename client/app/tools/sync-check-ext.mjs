/**
 * 2ブラウザセッション間の同期検証スクリプト(拡張版)。
 * sync-check.mjs で確認済みの項目以外を網羅する:
 *   - イベント作成(UI)/更新(API)/削除(UI)の他セッション検出
 *   - カレンダー作成(UI)/色変更(UI)/削除(UI)の他セッション検出
 *   - カレンダーリストからの削除・再追加の検出
 *   - オフライン→オンライン復帰時の自動検出
 *   - セッションカレンダーのスコープ確認
 *
 * 使い方: ORBIT_COOKIE_A='…' ORBIT_COOKIE_B='…' node tools/sync-check-ext.mjs
 * (Cookie は session_id の値のみを指定する。値は環境変数で渡し、ファイルに保存しない)
 */
import puppeteer from 'puppeteer';

const BASE = process.env.ORBIT_BASE_URL ?? 'http://localhost:5173';
const BFF = process.env.ORBIT_BFF_URL ?? 'http://localhost:8787';
const HOLIDAY_CID = 'ja.japanese#holiday@group.v.calendar.google.com';
const PRIMARY_CID = process.env.ORBIT_PRIMARY_CID ?? 'proxaxis.dev@gmail.com';
const SESSION_CAL_ID = 'en.usa#holiday@group.v.calendar.google.com';

const COOKIES = {
  A: process.env.ORBIT_COOKIE_A,
  B: process.env.ORBIT_COOKIE_B,
};
if (!COOKIES.A || !COOKIES.B) {
  console.error('ORBIT_COOKIE_A / ORBIT_COOKIE_B に session_id の値を指定してください');
  process.exit(1);
}

const results = [];
function report(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** BFF へ直接リクエストし、上流レスポンスの JSON を返す */
async function bff(cookie, service, method, url, body) {
  const res = await fetch(`${BFF}/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: `session_id=${cookie}` },
    body: JSON.stringify({ service, method, url, ...(body !== undefined ? { body } : {}) }),
  });
  if (res.status !== 202) throw new Error(`BFF queue failed: ${res.status}`);
  const { requestId } = await res.json();
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    await sleep(400);
    const poll = await fetch(`${BFF}/request/${requestId}`, { headers: { Cookie: `session_id=${cookie}` } });
    const result = await poll.json();
    if (result.state !== 'pending') {
      if (result.state !== 'done') throw new Error(`BFF failed: ${JSON.stringify(result.error)}`);
      const raw = result.response.bodyBase64 ? Buffer.from(result.response.bodyBase64, 'base64').toString() : '';
      return { status: result.response.status, json: raw ? JSON.parse(raw) : null };
    }
  }
  throw new Error('BFF poll timeout');
}

async function makeSession(browser, cookie, label) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  await page.setCookie({ name: 'session_id', value: cookie, domain: 'localhost' });
  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`${label}: ${msg.text().slice(0, 200)}`);
  });
  page.on('pageerror', (err) => errors.push(`${label}: PAGEERROR ${String(err).slice(0, 200)}`));
  return { ctx, page, errors, label };
}

async function waitForApp(page) {
  await page.waitForFunction(() => [...document.querySelectorAll('.calendar-ribbon .name')].some((el) => el.textContent.trim().length > 0), { timeout: 30000 });
}

/** カレンダー一覧(ナビ)に表示されている名前を取得 */
function navNames(page) {
  return page.evaluate(() => [...document.querySelectorAll('.calendar-ribbon .name')].map((el) => el.textContent.trim()));
}

/** 指定名のカレンダーリボンの色を取得 */
function ribbonColor(page, name) {
  return page.evaluate((target) => {
    const ribbon = [...document.querySelectorAll('.calendar-ribbon')].find((el) => el.textContent.trim() === target);
    return ribbon?.querySelector('.color')?.style.backgroundColor ?? null;
  }, name);
}

/** リモート変更チェックを手動発火(online イベント → checkRemoteChanges(force=truthy)) */
async function triggerRemoteSync(page) {
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await sleep(3000);
}

/** 月ビューに表示中のイベントタイトル一覧 */
function visibleEventTitles(page) {
  return page.evaluate(() => [...document.querySelectorAll('.event-bar')].map((el) => el.textContent.trim()));
}

/** イベントタイトルが表示されるまでポーリングで待つ */
async function waitForEventTitle(page, needle, timeout = 20000) {
  try {
    await page.waitForFunction((n) => [...document.querySelectorAll('.event-bar')].some((el) => el.textContent.includes(n)), { timeout, polling: 800 }, needle);
    return true;
  } catch {
    return false;
  }
}

/** イベントタイトルが消えるまでポーリングで待つ */
async function waitForEventTitleGone(page, needle, timeout = 20000) {
  try {
    await page.waitForFunction((n) => ![...document.querySelectorAll('.event-bar')].some((el) => el.textContent.includes(n)), { timeout, polling: 800 }, needle);
    return true;
  } catch {
    return false;
  }
}

/** ナビに指定名が現れる/消えるまでポーリングで待つ */
async function waitForNavName(page, name, present, timeout = 20000) {
  try {
    await page.waitForFunction((n, want) => [...document.querySelectorAll('.calendar-ribbon .name')].some((el) => el.textContent.trim().includes(n)) === want, { timeout, polling: 800 }, name, present);
    return true;
  } catch {
    return false;
  }
}

/** ラベル文字列を含む label 内の input に値を入力する */
async function fillInputByLabel(page, labelText, value) {
  await page.evaluate(
    ({ labelText: text, value: val }) => {
      const label = [...document.querySelectorAll('label')].find((l) => l.textContent.includes(text));
      const input = label?.querySelector('input, textarea, select');
      if (!input) throw new Error(`input not found: ${text}`);
      input.value = val;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    },
    { labelText, value },
  );
}

/** テキストを含むボタンをクリックする */
async function clickButtonByText(page, text) {
  const clicked = await page.evaluate((t) => {
    const button = [...document.querySelectorAll('button')].find((b) => b.textContent.trim().includes(t));
    if (!button) return false;
    button.click();
    return true;
  }, text);
  if (!clicked) throw new Error(`button not found: ${text}`);
}

/** 詳細アコーディオン「その他のアクション」を開く */
async function openExtraActions(page) {
  await page.evaluate(() => {
    const summary = [...document.querySelectorAll('summary, .summary-label, [class*="summary"]')].find((el) => el.textContent.includes('その他のアクション'));
    if (summary) summary.click();
  });
  await sleep(400);
}

/** 確認ダイアログの YES を押す */
async function confirmYes(page) {
  await page.waitForSelector('.confirm-button', { timeout: 5000 });
  await page.click('.confirm-button');
  await sleep(1000);
}

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
try {
  const A = await makeSession(browser, COOKIES.A, 'A');
  const B = await makeSession(browser, COOKIES.B, 'B');

  await A.page.goto(BASE, { waitUntil: 'networkidle0', timeout: 60000 });
  await B.page.goto(BASE, { waitUntil: 'networkidle0', timeout: 60000 });
  await waitForApp(A.page);
  await waitForApp(B.page);
  console.log('両セッション起動完了\n');

  const today = new Date();
  const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const nextDay = new Date(today.getTime() + 86400000);
  const ymdEnd = `${nextDay.getFullYear()}-${String(nextDay.getMonth() + 1).padStart(2, '0')}-${String(nextDay.getDate()).padStart(2, '0')}`;

  // --- Phase 1: A が UI でイベント作成 → B が検出 ---
  console.log('[Phase1] A が UI でイベント作成…');
  const evTitle = `UI作成テスト-${Date.now() % 100000}`;
  await A.page.goto(`${BASE}/evt/new`, { waitUntil: 'networkidle0', timeout: 60000 });
  await sleep(1500);
  const titleInput = await A.page.waitForSelector('input[aria-label="タイトル"], input[placeholder*="タイトル"]', { timeout: 10000 });
  await titleInput.type(evTitle);
  await A.page.click('button[type="submit"]');
  await sleep(3000);

  // 作成されたイベントを API で確認
  const eventsRes = await bff(COOKIES.A, 'calendar', 'GET', `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(PRIMARY_CID)}/events?timeMin=${ymd}T00:00:00%2B09:00&timeMax=${ymdEnd}T00:00:00%2B09:00&singleEvents=true`);
  const createdEvent = eventsRes.json?.items?.find((e) => e.summary === evTitle);
  report('UI 作成したイベントが Google に保存された', Boolean(createdEvent?.id), `id=${createdEvent?.id}`);

  await triggerRemoteSync(B.page);
  report('B がリモート同期で UI 作成イベントを検出・表示', await waitForEventTitle(B.page, evTitle));

  // --- Phase 2: 外部(API)でイベント更新 → B が検出 ---
  console.log('\n[Phase2] 外部APIでイベント更新…');
  const evTitleUpdated = `${evTitle}-更新`;
  await bff(COOKIES.A, 'calendar', 'PATCH', `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(PRIMARY_CID)}/events/${createdEvent.id}`, { summary: evTitleUpdated });
  await triggerRemoteSync(B.page);
  report('B がイベント更新を検出(新タイトル表示)', await waitForEventTitle(B.page, evTitleUpdated));

  // --- Phase 3: A が UI でイベント削除 → B が検出 ---
  console.log('\n[Phase3] A が UI でイベント削除…');
  await A.page.goto(`${BASE}/evt/detail?eid=${encodeURIComponent(createdEvent.id)}&cid=${encodeURIComponent(PRIMARY_CID)}`, { waitUntil: 'networkidle0', timeout: 60000 });
  await sleep(2000);
  await A.page.click('button[title="Delete"]');
  await confirmYes(A.page);
  await sleep(1500);
  await A.page.goto(BASE, { waitUntil: 'networkidle0', timeout: 60000 });
  await waitForApp(A.page);
  report('A でイベントが削除された(UI)', await waitForEventTitleGone(A.page, evTitleUpdated));

  await triggerRemoteSync(B.page);
  report('B がイベント削除を検出(タイトル消失)', await waitForEventTitleGone(B.page, evTitleUpdated));

  // --- Phase 4: A が UI でカレンダー作成 → B が検出 ---
  console.log('\n[Phase4] A が UI でカレンダー作成…');
  const newCalName = `テストカレンダー-${Date.now() % 100000}`;
  await A.page.goto(`${BASE}/cal/new`, { waitUntil: 'networkidle0', timeout: 60000 });
  await sleep(1200);
  await fillInputByLabel(A.page, 'カレンダー名称', newCalName);
  await A.page.click('button[type="submit"]');
  await sleep(4000);

  // 新カレンダーの ID を API で取得
  const listRes = await bff(COOKIES.A, 'calendar', 'GET', 'https://www.googleapis.com/calendar/v3/users/me/calendarList');
  const newCal = listRes.json?.items?.find((i) => i.summary === newCalName);
  report('UI 作成したカレンダーが Google に保存された', Boolean(newCal?.id), `id=${newCal?.id}`);

  await triggerRemoteSync(B.page);
  report('B がリモート同期で新カレンダーを検出・表示', await waitForNavName(B.page, newCalName, true));

  // --- Phase 5: A が UI でカレンダー色変更 → B が検出 ---
  console.log('\n[Phase5] A が UI でカレンダー色を変更…');
  await A.page.goto(`${BASE}/cal/detail?cid=${encodeURIComponent(newCal.id)}`, { waitUntil: 'networkidle0', timeout: 60000 });
  await sleep(1500);
  const colorBefore = await ribbonColor(B.page, newCalName);
  await A.page.evaluate(() => {
    const button = [...document.querySelectorAll('button[role="option"]')].find((b) => !b.classList.contains('active'));
    button?.click();
  });
  await sleep(500);
  await A.page.click('button[type="submit"]');
  await sleep(3500);

  await triggerRemoteSync(B.page);
  let colorAfter = null;
  for (let i = 0; i < 15 && !(colorAfter && colorAfter !== colorBefore); i++) {
    await sleep(800);
    colorAfter = await ribbonColor(B.page, newCalName);
  }
  report('B がカレンダー色変更を検出', Boolean(colorAfter) && colorBefore !== colorAfter, `${colorBefore} → ${colorAfter}`);

  // --- Phase 6: A が UI でカレンダー削除 → B が検出 ---
  console.log('\n[Phase6] A が UI でカレンダー削除…');
  await openExtraActions(A.page);
  await clickButtonByText(A.page, 'カレンダーを削除');
  await confirmYes(A.page);
  await sleep(2000);
  await A.page.goto(BASE, { waitUntil: 'networkidle0', timeout: 60000 });
  await waitForApp(A.page);
  report('A でカレンダーが削除された(UI)', await waitForNavName(A.page, newCalName, false));

  await triggerRemoteSync(B.page);
  report('B がカレンダー削除を検出(ナビから消失)', await waitForNavName(B.page, newCalName, false));

  // --- Phase 7: A が UI でカレンダーをリストから削除 → B 検出 → API で再追加 → B 検出 ---
  console.log('\n[Phase7] A が「日本の祝日」をリストから削除 → 再追加…');
  await A.page.goto(`${BASE}/cal/detail?cid=${encodeURIComponent(HOLIDAY_CID)}`, { waitUntil: 'networkidle0', timeout: 60000 });
  await sleep(1500);
  await openExtraActions(A.page);
  await clickButtonByText(A.page, 'リストから削除');
  await confirmYes(A.page);
  await sleep(2000);
  await A.page.goto(BASE, { waitUntil: 'networkidle0', timeout: 60000 });
  await waitForApp(A.page);
  report('A で「日本の祝日」がリストから削除された(UI)', await waitForNavName(A.page, '日本の祝日', false));

  await triggerRemoteSync(B.page);
  report('B がリスト削除を検出(ナビから消失)', await waitForNavName(B.page, '日本の祝日', false));

  // 元に戻す(API で再追加)
  await bff(COOKIES.A, 'calendar', 'POST', 'https://www.googleapis.com/calendar/v3/users/me/calendarList', { id: HOLIDAY_CID });
  await sleep(1500);
  await triggerRemoteSync(B.page);
  report('B が再追加を検出(ナビに復帰)', await waitForNavName(B.page, '日本の祝日', true));

  // --- Phase 8: B をオフライン → A が変更 → B オンライン復帰で自動検出 ---
  console.log('\n[Phase8] B オフライン中に A がイベント作成 → B 復帰で自動検出…');
  await B.page.setOfflineMode(true);
  await sleep(1000);
  const evTitleOffline = `オフライン検知-${Date.now() % 100000}`;
  const offlineEv = await bff(COOKIES.A, 'calendar', 'POST', `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(PRIMARY_CID)}/events`, {
    summary: evTitleOffline,
    start: { date: ymd },
    end: { date: ymdEnd },
  });
  const offlineEventId = offlineEv.json?.id;
  report('B オフライン中はイベントを表示しない', !(await visibleEventTitles(B.page)).some((t) => t.includes(evTitleOffline)));

  await B.page.setOfflineMode(false);
  await sleep(6000); // 'online' イベント → checkRemoteChanges が自動発火
  report('B がオンライン復帰でイベントを自動検出・表示', await waitForEventTitle(B.page, evTitleOffline));

  // --- Phase 9: A が「他のカレンダーを追加」(calendarList.insert) → B が検出 → 削除 ---
  console.log('\n[Phase9] A が外部カレンダーを購読追加 → B が検出…');
  await A.page.goto(`${BASE}/cal/add`, { waitUntil: 'networkidle0', timeout: 60000 });
  await sleep(1200);
  await fillInputByLabel(A.page, 'カレンダー ID', SESSION_CAL_ID);
  await A.page.click('button[type="submit"]');
  await sleep(4000);
  await A.page.goto(BASE, { waitUntil: 'networkidle0', timeout: 60000 });
  await waitForApp(A.page);
  const namesA9 = await navNames(A.page);
  report('A のナビに追加したカレンダーが表示された', namesA9.some((n) => n.includes('Holidays')), `A=[${namesA9}]`);

  await triggerRemoteSync(B.page);
  // 「他のカレンダーを追加」は calendarList.insert(実購読)なので全デバイスへ伝播するのが正しい
  report('B がカレンダー追加を検出(ナビに表示)', await waitForNavName(B.page, 'Holidays', true));

  // --- クリーンアップ ---
  console.log('\n[Cleanup] 追加カレンダー・オフライン検知イベントを削除…');
  await bff(COOKIES.A, 'calendar', 'DELETE', `https://www.googleapis.com/calendar/v3/users/me/calendarList/${encodeURIComponent(SESSION_CAL_ID)}`);
  if (offlineEventId) await bff(COOKIES.A, 'calendar', 'DELETE', `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(PRIMARY_CID)}/events/${offlineEventId}`);
  await sleep(1500);
  await triggerRemoteSync(B.page);
  report('B が追加カレンダーの削除を検出(ナビから消失)', await waitForNavName(B.page, 'Holidays', false));

  // --- コンソールエラー集計 ---
  console.log('\n[Console errors]');
  for (const s of [A, B]) for (const e of s.errors) console.log('  ' + e);
  if (!A.errors.length && !B.errors.length) console.log('  なし');

  console.log('\n===== 結果サマリ =====');
  const fails = results.filter((r) => !r.ok);
  console.log(`${results.length - fails.length}/${results.length} 件パス`);
  process.exitCode = fails.length ? 1 : 0;
} finally {
  await browser.close();
}
