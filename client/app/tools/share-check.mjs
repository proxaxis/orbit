/**
 * 2セッション共有フロー検証 (Playwright WebKit)。
 * セッションAで範囲指定共有を作成 → 共有リンクを発行 → セッションBで開いて登録確認
 * → セッションカレンダー登録(または Google 側自動登録の確認)を検証し、
 * 続いて通常 ACL 共有(mode=list → calendarList.insert)の受け入れを検証する。
 * 最後に作成した共有物をクリーンアップする。
 *
 * 使い方: ORBIT_COOKIE_A='…' ORBIT_COOKIE_B='…' node tools/share-check.mjs
 * (Cookie は session_id の値のみを指定する。値は環境変数で渡し、ファイルに保存しない)
 * 前提: dev サーバ(localhost:5173)と BFF(localhost:8787)が起動していること。
 */
import { webkit } from 'playwright';

const BASE = 'http://localhost:5173';
const BFF = 'http://localhost:8787';
const API = 'https://www.googleapis.com/calendar/v3';
const A_MAIL = process.env.ORBIT_MAIL_A ?? 'proxaxis.me@gmail.com';
const B_MAIL = process.env.ORBIT_MAIL_B ?? 'proxaxis.dev@gmail.com';
const COOKIE_A = process.env.ORBIT_COOKIE_A;
const COOKIE_B = process.env.ORBIT_COOKIE_B;
if (!COOKIE_A || !COOKIE_B) {
  console.error('ORBIT_COOKIE_A / ORBIT_COOKIE_B に session_id の値を指定してください');
  process.exit(1);
}

const results = [];
const report = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function bff(cookie, service, method, url, body) {
  const res = await fetch(`${BFF}/request`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: `session_id=${cookie}` },
    body: JSON.stringify({ service, method, url, headers: { 'Content-Type': 'application/json' }, ...(body !== undefined ? { body } : {}) }) });
  if (res.status !== 202) throw new Error(`queue ${res.status}`);
  const { requestId } = await res.json();
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    await sleep(400);
    const r = await (await fetch(`${BFF}/request/${requestId}`, { headers: { Cookie: `session_id=${cookie}` } })).json();
    if (r.state === 'failed') throw new Error(`bff failed: ${JSON.stringify(r.error)}`);
    if (r.state === 'done') {
      const raw = r.response.bodyBase64 ? Buffer.from(r.response.bodyBase64, 'base64').toString() : '';
      return { status: r.response.status, json: raw ? JSON.parse(raw) : null };
    }
  }
  throw new Error('timeout');
}

const cookieFor = (value) => ({ name: 'session_id', value, domain: 'localhost', path: '/', sameSite: 'Lax', httpOnly: false, secure: false });

const browser = await webkit.launch({
  headless: true,
  executablePath: webkit.executablePath(),
  env: {
    ...process.env,
    LD_LIBRARY_PATH: '/tmp/wk-libs/root/usr/lib/x86_64-linux-gnu',
    __EGL_VENDOR_LIBRARY_DIRS: '/tmp/wk-libs/root/usr/share/glvnd/egl_vendor.d',
    LIBGL_DRIVERS_PATH: '/tmp/wk-libs/root/usr/lib/x86_64-linux-gnu/dri',
  },
});
const ctxA = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const ctxB = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await ctxA.addCookies([cookieFor(COOKIE_A)]);
await ctxB.addCookies([cookieFor(COOKIE_B)]);

// 共有リンクの取得用に navigator.share / clipboard を捕捉
await ctxA.addInitScript(() => {
  window.__shareUrl = null;
  Object.defineProperty(navigator, 'share', { value: async (d) => { window.__shareUrl = d.url || d.text || null; }, configurable: true });
  const clip = { writeText: async (t) => { window.__shareUrl = t; } };
  Object.defineProperty(navigator, 'clipboard', { value: clip, configurable: true });
});

const pageA = await ctxA.newPage();
const pageB = await ctxB.newPage();
pageA.on('pageerror', (e) => console.log('[A pageerror]', e.message));
pageB.on('pageerror', (e) => console.log('[B pageerror]', e.message));

try {
  // ===== A: 範囲指定共有を作成 =====
  await pageA.goto(`${BASE}/cal/share`, { waitUntil: 'load' });
  await pageA.waitForSelector('.recipient-field input', { timeout: 30000 });
  // カレンダー一覧の読み込みを待ち、先頭のカレンダーを明示的に選択する
  await pageA.waitForSelector('.create-form .calendar-list > *', { timeout: 90000 });
  await sleep(1000);
  const ribbons = await pageA.$$('.create-form .calendar-list button.calendar-ribbon.selectable');
  report('A: 書き込み可能カレンダーが表示', ribbons.length > 0, `${ribbons.length}件`);
  const alreadySelected = await pageA.$('.create-form .calendar-list button.calendar-ribbon.selected');
  if (!alreadySelected && ribbons.length) await ribbons[0].click();
  await sleep(500);
  await pageA.fill('.recipient-field input', B_MAIL);
  await pageA.click('button:has-text("共有を作成")');
  // 作成には Google API 呼び出しが直列するため、spec 出現・エラートースト・ダイアログを監視しながら待つ
  let copyCid = null;
  for (let i = 0; i < 80 && !copyCid; i++) {
    await sleep(3000);
    copyCid = await pageA.evaluate(() => document.querySelector('.spec-id code')?.textContent?.trim() ?? null);
    const toast = await pageA.evaluate(() => document.querySelector('.toast-message')?.textContent?.trim() ?? '');
    const errDlg = await pageA.evaluate(() => document.querySelector('.user-dialog, [role="alert"]')?.textContent?.trim() ?? '');
    if (i % 5 === 0 || toast || errDlg) console.log(`  [A t+${(i + 1) * 3}s] toast=${toast.slice(0, 80)} err=${errDlg.slice(0, 80)}`);
    if (errDlg) break;
  }
  report('A: 範囲指定共有カレンダー作成', !!copyCid, copyCid ?? '未作成');

  // 共有リンクの取得
  await pageA.click('button:has-text("共有リンク")');
  await sleep(1000);
  const shareUrl = await pageA.evaluate(() => window.__shareUrl);
  report('A: 共有リンク生成', !!shareUrl && shareUrl.includes('/share/accept?cid='), shareUrl ?? '未取得');

  // ===== B: リンクを開いてセッションカレンダー登録 =====
  const cid = new URL(shareUrl).searchParams.get('cid');
  await pageB.goto(shareUrl, { waitUntil: 'load' });
  await pageB.waitForSelector('button:has-text("セッションカレンダーに登録")', { timeout: 30000 });
  const shownName = await pageB.evaluate(() => document.querySelector('.share-accept-view')?.textContent ?? '');
  report('B: 登録確認画面にカレンダー情報表示', shownName.trim().length > 0, shownName.slice(0, 80).replace(/\s+/g, ' '));
  // カレンダー一覧の初期化完了を待つ（初期ロード中は isLoading でボタン無効）
  let sessionDone = false;
  for (let i = 0; i < 40 && !sessionDone; i++) {
    await sleep(3000);
    const st = await pageB.evaluate(() => ({
      disabled: document.querySelector('button[data-app-button="primary"]')?.disabled ?? true,
      text: document.querySelector('.share-accept-view')?.textContent ?? '',
    }));
    if (st.disabled && st.text.includes('すでに一覧にあります')) {
      // Google 側の ACL 自動購読で既に登録済み → 冪等性の確認として扱う
      console.log('  [B] Google 側で自動登録済み — 「すでに一覧にあります」表示を確認');
      sessionDone = true;
      break;
    }
    if (!st.disabled) {
      await pageB.click('button:has-text("セッションカレンダーに登録")');
      await pageB.waitForURL((url) => !url.pathname.includes('/share/accept'), { timeout: 15000 });
      await sleep(1500);
      sessionDone = 'clicked';
    }
  }
  report('B: 登録ボタン処理', !!sessionDone, sessionDone === 'clicked' ? 'クリックで登録' : '自動登録済み');

  // セッション登録した場合は IndexedDB を、自動登録の場合は実 calendarList を確認
  if (sessionDone === 'clicked') {
    const registered = await pageB.evaluate(async (cid) => {
      const db = await new Promise((res, rej) => { const r = indexedDB.open('orbit-offline', 1); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
      return await new Promise((res, rej) => {
        const rq = db.transaction('settings', 'readonly').objectStore('settings').get('session-calendars');
        rq.onsuccess = () => res((rq.result ?? []).map((c) => c.id));
        rq.onerror = () => rej(rq.error);
      });
    }, cid);
    report('B: セッションカレンダーに登録', registered.includes(cid), JSON.stringify(registered));
  } else {
    const listB0 = await bff(COOKIE_B, 'calendar', 'GET', `${API}/users/me/calendarList`);
    report('B: カレンダーリストへ自動登録', listB0.json?.items?.some((c) => c.id === cid) === true);
  }

  // B のトークンでコピーカレンダーの events.list
  const ev = await bff(COOKIE_B, 'calendar', 'GET', `${API}/calendars/${encodeURIComponent(cid)}/events?maxResults=5`);
  report('B: 共有カレンダーの予定を読み取り可能', ev.status === 200, `status=${ev.status} items=${ev.json?.items?.length ?? 0}`);

  // 再度リンクを開く → 登録済み判定
  await pageB.goto(shareUrl, { waitUntil: 'load' });
  await sleep(3000);
  const dupText = await pageB.evaluate(() => document.querySelector('.share-accept-view')?.textContent ?? '');
  const dupDisabled = await pageB.evaluate(() => document.querySelector('button[data-app-button="primary"]')?.disabled);
  report('B: 再オープンで登録済み表示', dupText.includes('すでに一覧にあります') && dupDisabled === true);

  // ===== 通常 ACL 共有 → mode=list =====
  const acl = await bff(COOKIE_A, 'calendar', 'POST', `${API}/calendars/${encodeURIComponent(A_MAIL)}/acl`, {
    scope: { type: 'user', value: B_MAIL }, role: 'reader',
  });
  report('A: プライマリカレンダーに ACL 追加', acl.status === 200, `ruleId=${acl.json?.id}`);
  const aclRuleId = acl.json?.id;
  await sleep(2000);

  await pageB.goto(`${BASE}/share/accept?cid=${encodeURIComponent(A_MAIL)}&mode=list`, { waitUntil: 'load' });
  await pageB.waitForSelector('button:has-text("カレンダーリストに登録")', { timeout: 30000 });
  await sleep(5000); // カレンダー一覧の初期化を待つ
  // Google は user スコープの ACL 作成時に受信者側へ自動登録することがある → 登録済み表示なら冪等性確認として扱う
  const listAlready = await pageB.evaluate(() => ({
    disabled: document.querySelector('button[data-app-button="primary"]')?.disabled ?? false,
    text: document.querySelector('.share-accept-view')?.textContent ?? '',
  }));
  if (listAlready.disabled && listAlready.text.includes('すでに一覧にあります')) {
    console.log('  [B] Google 側で自動登録済み — 「すでに一覧にあります」表示を確認');
  } else {
    await pageB.waitForSelector('button:has-text("カレンダーリストに登録"):not([disabled])', { timeout: 120000 });
    await pageB.click('button:has-text("カレンダーリストに登録")');
    await pageB.waitForURL((url) => !url.pathname.includes('/share/accept'), { timeout: 20000 });
    await sleep(2000);
  }
  const listB = await bff(COOKIE_B, 'calendar', 'GET', `${API}/users/me/calendarList`);
  const inList = listB.json?.items?.some((c) => c.id === A_MAIL);
  report('B: calendarList に A のプライマリ登録', inList === true, inList ? '登録確認' : JSON.stringify(listB.json?.items?.map((c) => c.id)));

  // ===== クリーンアップ =====
  // B: calendarList 登録解除
  const del = await bff(COOKIE_B, 'calendar', 'DELETE', `${API}/users/me/calendarList/${encodeURIComponent(A_MAIL)}`);
  report('cleanup: B calendarList 解除', del.status === 204 || del.status === 200, `status=${del.status}`);
  // B: セッションカレンダー削除
  await pageB.evaluate(async (cid) => {
    const db = await new Promise((res, rej) => { const r = indexedDB.open('orbit-offline', 1); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const cur = await new Promise((res, rej) => { const rq = db.transaction('settings', 'readonly').objectStore('settings').get('session-calendars'); rq.onsuccess = () => res(rq.result ?? []); rq.onerror = () => rej(rq.error); });
    await new Promise((res, rej) => { const rq = db.transaction('settings', 'readwrite').objectStore('settings').put(cur.filter((c) => c.id !== cid), 'session-calendars'); rq.onsuccess = () => res(); rq.onerror = () => rej(rq.error); });
  }, cid);
  // A: ACL 削除 + 共有解除(UI 経由で spec とコピーカレンダーを削除)
  if (aclRuleId) await bff(COOKIE_A, 'calendar', 'DELETE', `${API}/calendars/${encodeURIComponent(A_MAIL)}/acl/${encodeURIComponent(aclRuleId)}`);
  await pageA.goto(`${BASE}/cal/share`, { waitUntil: 'load' });
  await sleep(1500);
  const revokeBtn = await pageA.$('button.revoke:has-text("共有を解除")');
  if (revokeBtn) {
    await revokeBtn.click();
    await pageA.waitForSelector('button.confirm-button', { timeout: 10000 });
    await pageA.click('button.confirm-button');
    await sleep(4000);
  }
  const specLeft = await pageA.$('.spec-id code');
  report('cleanup: A の共有解除 + spec 削除', !specLeft);
  // calendars.get は削除直後も 200 を返すことがあるため calendarList 側で確認する
  const listA = await bff(COOKIE_A, 'calendar', 'GET', `${API}/users/me/calendarList`);
  const stillInList = listA.json?.items?.some((c) => c.id === cid);
  report('cleanup: コピーカレンダーが一覧から削除済み', stillInList === false);
} catch (e) {
  report('実行中の例外', false, e.message);
  await pageA.screenshot({ path: '/tmp/share-A-fail.png' });
  await pageB.screenshot({ path: '/tmp/share-B-fail.png' });
}

console.log(`\n${results.filter((r) => r.ok).length}/${results.length} passed`);
await browser.close();
process.exit(results.every((r) => r.ok) ? 0 : 1);
