/**
 * 2ブラウザセッション間の同期検証スクリプト。
 * dev サーバ(localhost:5173) + BFF(localhost:8787 → server:8787 フォワード)を使い、
 * セッションAでの変更がセッションBへ伝播するかを検証する。
 *
 * 使い方: ORBIT_COOKIE_A='…' ORBIT_COOKIE_B='…' node tools/sync-check.mjs
 * (Cookie は session_id の値のみを指定する。値は環境変数で渡し、ファイルに保存しない)
 */
import puppeteer from 'puppeteer';

const BASE = process.env.ORBIT_BASE_URL ?? 'http://localhost:5173';
const BFF = process.env.ORBIT_BFF_URL ?? 'http://localhost:8787';
const HOLIDAY_CID = 'ja.japanese#holiday@group.v.calendar.google.com';
const PRIMARY_CID = process.env.ORBIT_PRIMARY_CID ?? 'proxaxis.dev@gmail.com';

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

/** リモート変更チェックを手動発火(online イベント → checkRemoteChanges(force=truthy)) */
async function triggerRemoteSync(page) {
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await sleep(2500);
}

/** 月ビューに表示中のイベントタイトル一覧 */
function visibleEventTitles(page) {
  return page.evaluate(() => [...document.querySelectorAll('.event-bar')].map((el) => el.textContent.trim()));
}

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
try {
  const A = await makeSession(browser, COOKIES.A, 'A');
  const B = await makeSession(browser, COOKIES.B, 'B');

  // --- Phase 0: 両セッションのログイン確認 ---
  await A.page.goto(BASE, { waitUntil: 'networkidle0', timeout: 60000 });
  await B.page.goto(BASE, { waitUntil: 'networkidle0', timeout: 60000 });
  await waitForApp(A.page);
  await waitForApp(B.page);
  const namesA = await navNames(A.page);
  const namesB = await navNames(B.page);
  report('両セッションがログイン済みでカレンダーを表示', namesA.includes('デバッグカレンダー') && namesB.includes('デバッグカレンダー'), `A=[${namesA}] B=[${namesB}]`);

  // --- Phase 1: セッションAで共有カレンダーに別名 → セッションBへ伝播 ---
  console.log('\n[Phase1] A で「日本の祝日」に別名を設定…');
  await A.page.goto(`${BASE}/cal/detail?cid=${encodeURIComponent(HOLIDAY_CID)}`, { waitUntil: 'networkidle0', timeout: 60000 });
  await sleep(1500);
  await A.page.evaluate(() => {
    const label = [...document.querySelectorAll('label')].find((l) => l.textContent.includes('カレンダー名称'));
    const input = label?.querySelector('input');
    input.value = '別名祝日A';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await A.page.click('button[type="submit"]');
  await sleep(3500);

  const entryAfterPatch = await bff(COOKIES.B, 'calendar', 'GET', `https://www.googleapis.com/calendar/v3/users/me/calendarList/${encodeURIComponent(HOLIDAY_CID)}`);
  report('API: summaryOverride が Google に保存された', entryAfterPatch.json?.summaryOverride === '別名祝日A', `summaryOverride=${entryAfterPatch.json?.summaryOverride}`);

  await A.page.goto(BASE, { waitUntil: 'networkidle0', timeout: 60000 });
  await waitForApp(A.page);
  report('A のナビに別名が表示される', (await navNames(A.page)).includes('別名祝日A'));

  // B: ページ再読込せずにリモート同期を発火
  await triggerRemoteSync(B.page);
  report('B がリモート同期で別名を検出して表示', (await navNames(B.page)).includes('別名祝日A'));

  // B: IndexedDB キャッシュを全消去してリロード → 別名が残るか(前バグの再現確認)
  await B.page.evaluate(async () => {
    const dbs = await indexedDB.databases();
    await Promise.all(dbs.map((d) => new Promise((res) => { const req = indexedDB.deleteDatabase(d.name); req.onsuccess = req.onerror = res; })));
  });
  await B.page.goto(BASE, { waitUntil: 'networkidle0', timeout: 60000 });
  await waitForApp(B.page);
  report('B がキャッシュ全削除後のリロードでも別名を表示', (await navNames(B.page)).includes('別名祝日A'));

  // --- Phase 2: 外部(API)からのイベント作成 → B が検出 ---
  console.log('\n[Phase2] 外部APIでイベント作成 → B のリモート同期で検出…');
  const today = new Date();
  const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const nextDay = new Date(today.getTime() + 86400000);
  const ymdEnd = `${nextDay.getFullYear()}-${String(nextDay.getMonth() + 1).padStart(2, '0')}-${String(nextDay.getDate()).padStart(2, '0')}`;
  const evTitle = `同期テスト-${Date.now() % 100000}`;
  const created = await bff(COOKIES.A, 'calendar', 'POST', `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(PRIMARY_CID)}/events`, {
    summary: evTitle,
    start: { date: ymd },
    end: { date: ymdEnd },
  });
  report('API: イベント作成成功', created.status === 200, `id=${created.json?.id}`);
  const createdEventId = created.json?.id;

  await triggerRemoteSync(B.page);
  await sleep(3000);
  await triggerRemoteSync(B.page); // REMOTE_SYNC_CHECKED_AT が未プライムの場合の2回目
  await sleep(3000);
  let titles = await visibleEventTitles(B.page);
  report('B が外部作成イベントを表示', titles.some((t) => t.includes(evTitle)), `件数=${titles.length}`);

  // --- Phase 3: A でオーナーカレンダー名を変更 → B が検出 ---
  console.log('\n[Phase3] A で「デバッグカレンダー」を改名 → B のリモート同期…');
  await A.page.goto(`${BASE}/cal/detail?cid=${encodeURIComponent(PRIMARY_CID)}`, { waitUntil: 'networkidle0', timeout: 60000 });
  await sleep(1500);
  await A.page.evaluate(() => {
    const label = [...document.querySelectorAll('label')].find((l) => l.textContent.includes('カレンダー名称'));
    const input = label?.querySelector('input');
    input.value = 'デバッグカレンダー改名';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await A.page.click('button[type="submit"]');
  await sleep(3500);

  await A.page.goto(BASE, { waitUntil: 'networkidle0', timeout: 60000 });
  await waitForApp(A.page);
  report('A のナビに新しいカレンダー名が表示される', (await navNames(A.page)).includes('デバッグカレンダー改名'));

  await triggerRemoteSync(B.page);
  report('B がリモート同期でカレンダー改名を検出して表示', (await navNames(B.page)).includes('デバッグカレンダー改名'));

  // --- クリーンアップ ---
  console.log('\n[Cleanup] 別名・イベント・カレンダー名を元に戻す…');
  await bff(COOKIES.A, 'calendar', 'PATCH', `https://www.googleapis.com/calendar/v3/users/me/calendarList/${encodeURIComponent(HOLIDAY_CID)}`, { summaryOverride: null });
  if (createdEventId) await bff(COOKIES.A, 'calendar', 'DELETE', `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(PRIMARY_CID)}/events/${createdEventId}`);
  await bff(COOKIES.A, 'calendar', 'PATCH', `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(PRIMARY_CID)}`, { summary: 'デバッグカレンダー' });
  await sleep(1000);
  const restored = await bff(COOKIES.A, 'calendar', 'GET', `https://www.googleapis.com/calendar/v3/users/me/calendarList/${encodeURIComponent(HOLIDAY_CID)}`);
  console.log(`holiday override復元: ${restored.json?.summaryOverride ?? '(none)'}`);

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
