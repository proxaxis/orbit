import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { google } from 'googleapis';

// hono の署名付き Cookie と同じ HMAC-SHA256 + base64 の署名を生成する
/**
 * @param {string} value
 * @param {string} secret
 */
const signCookie = async (value, secret) => {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
};

// .env から環境変数を読み込む（存在しなくてもよい）
try {
  process.loadEnvFile();
} catch {
  // .env がない環境ではアプリ側のデフォルト値が使われる
}
// テスト専用の Realm ファイルを使う（index.js 読み込み前に設定が必要。
// 他テストファイルと別ファイルにしてワーカーの干渉を防ぐ）
process.env.REALM_PATH = '/tmp/orbit-bff-request-test.realm';

const {
  app,
  redis,
  realm,
  SESSION_SECRET,
  drainApiRequests,
  createSession,
  upsertUser,
  upsertGrant,
  getGrant,
} = await import('../src/index.js');

// --- 上流 Google API のスタブ ---
// BFF のプロキシが使う globalThis.fetch を差し替え、呼び出しを記録する
/** @type {(input: any, init: any) => Promise<Response>} */
let upstreamHandler = async () => new Response('{}', { status: 200 });
/** @type {{ url: string, init: any }[]} */
let upstreamCalls = [];

const realFetch = globalThis.fetch;

// OAuth2Client#refreshAccessToken のスタブ（googleapis 内部は node-fetch なので
// fetch スタブでは捕捉できない。プロトタイプを差し替えて検証する）
const oauth2Proto = google.auth.OAuth2.prototype;
const realRefreshAccessToken = oauth2Proto.refreshAccessToken;
/** @type {null | (() => Promise<any>)} */
let refreshStub = null;

before(async () => {
  // 前回実行の残りジョブがワーカーに拾われないよう掃除する
  realm.write(() => {
    const leftover = realm.objects('ApiRequest');
    if (leftover.length) {
      realm.delete(leftover);
    }
  });
  globalThis.fetch = (input, init) => {
    upstreamCalls.push({ url: String(input), init });
    return upstreamHandler(input, init);
  };
  oauth2Proto.refreshAccessToken = async function () {
    if (refreshStub) {
      return refreshStub();
    }
    throw Object.assign(new Error('refreshAccessToken is not stubbed'), {
      response: { data: { error: 'invalid_grant' } },
    });
  };
});

after(() => {
  globalThis.fetch = realFetch;
  oauth2Proto.refreshAccessToken = realRefreshAccessToken;
  redis.disconnect();
  realm.close();
  // Realm の内部スレッドがイベントループを保持してプロセスが終了しないため、
  // 出力を流し切ったあと明示的に終了する
  setTimeout(() => process.exit(0), 100).unref();
});

// テスト用のユーザ＋ログイン済みセッションを Realm に作り、Cookie ヘッダ値を返す
const createLogin = async () => {
  const userId = `test-user-${crypto.randomUUID()}`;
  upsertUser(userId);
  const sessionId = createSession(userId);
  const signature = await signCookie(sessionId, SESSION_SECRET);
  const cookie = `session_id=${encodeURIComponent(`${sessionId}.${signature}`)}`;
  return { userId, sessionId, cookie };
};

const cleanupLogin = (/** @type {string} */ userId, /** @type {string} */ sessionId) => {
  realm.write(() => {
    const session = realm.objectForPrimaryKey('Session', sessionId);
    if (session) {
      realm.delete(session);
    }
    const grants = [...realm.objects('OAuthGrant').filtered('userId == $0', userId)];
    for (const grant of grants) {
      realm.delete(grant);
    }
    const user = realm.objectForPrimaryKey('User', userId);
    if (user) {
      realm.delete(user);
    }
    const reqs = [...realm.objects('ApiRequest').filtered('sessionId == $0', sessionId)];
    for (const req of reqs) {
      realm.delete(req);
    }
    const logs = [...realm.objects('ApiRequestLog').filtered('sessionId == $0', sessionId)];
    for (const log of logs) {
      realm.delete(log);
    }
  });
};

const postRequest = (/** @type {string} */ cookie, /** @type {unknown} */ envelope) =>
  app.request('/request', {
    method: 'POST',
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify(envelope),
  });

const getRequest = (/** @type {string} */ cookie, /** @type {string} */ requestId) =>
  app.request(`/request/${requestId}`, { headers: { Cookie: cookie } });

// POST して 202 を確認し、ワーカーを回して結果 JSON を取り出すヘルパ
const runRequest = async (/** @type {string} */ cookie, /** @type {unknown} */ envelope) => {
  const res = await postRequest(cookie, envelope);
  assert.equal(res.status, 202);
  const { requestId } = await res.json();
  assert.ok(requestId);
  await drainApiRequests();
  return { requestId, result: await (await getRequest(cookie, requestId)).json() };
};

const CALENDAR_URL =
  'https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=2026-01-01T00:00:00Z';
const PEOPLE_URL = 'https://people.googleapis.com/v1/people:searchContacts?query=a';
const PHOTOS_URL = 'https://photoslibrary.googleapis.com/v1/mediaItems:batchCreate';
const MEDIA_URL = 'https://lh3.googleusercontent.com/abc123=download';

const withGrant = (/** @type {string} */ userId, /** @type {string} */ type, /** @type {string} */ token) =>
  upsertGrant(userId, type, {
    accessToken: token,
    refreshToken: `rt-${type}`,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  });

const decodeBody = (/** @type {string} */ bodyBase64) =>
  Buffer.from(bodyBase64, 'base64');

describe('POST /request', () => {
  it('returns 401 without a session cookie', async () => {
    const res = await postRequest('', {
      service: 'calendar',
      method: 'GET',
      url: CALENDAR_URL,
    });
    assert.equal(res.status, 401);
  });

  it('returns 400 for an unknown service, method, or malformed URL', async () => {
    const { userId, sessionId, cookie } = await createLogin();
    try {
      let res = await postRequest(cookie, {
        service: 'gmail',
        method: 'GET',
        url: 'https://gmail.googleapis.com/x',
      });
      assert.equal(res.status, 400);

      res = await postRequest(cookie, {
        service: 'calendar',
        method: 'CONNECT',
        url: CALENDAR_URL,
      });
      assert.equal(res.status, 400);

      res = await postRequest(cookie, {
        service: 'calendar',
        method: 'GET',
        url: 'not-a-url',
      });
      assert.equal(res.status, 400);
    } finally {
      cleanupLogin(userId, sessionId);
    }
  });

  it('rejects URLs outside the service allowlist (SSRF guard)', async () => {
    const { userId, sessionId, cookie } = await createLogin();
    try {
      // People API の URL を calendar サービスでは拒否
      let res = await postRequest(cookie, {
        service: 'calendar',
        method: 'GET',
        url: PEOPLE_URL,
      });
      assert.equal(res.status, 400);
      assert.equal((await res.json()).error.code, 'URL_NOT_ALLOWED');

      // googleusercontent は photos サービス専用
      res = await postRequest(cookie, {
        service: 'calendar',
        method: 'GET',
        url: MEDIA_URL,
      });
      assert.equal(res.status, 400);

      // https 以外は拒否
      res = await postRequest(cookie, {
        service: 'people',
        method: 'GET',
        url: PEOPLE_URL.replace('https://', 'http://'),
      });
      assert.equal(res.status, 400);

      // 許可リスト外のホストは拒否
      res = await postRequest(cookie, {
        service: 'people',
        method: 'GET',
        url: 'https://evil.example.com/v1/people',
      });
      assert.equal(res.status, 400);
    } finally {
      cleanupLogin(userId, sessionId);
    }
  });

  it('returns 403 SCOPE_NOT_AUTHORIZED when the grant does not exist', async () => {
    const { userId, sessionId, cookie } = await createLogin();
    try {
      const res = await postRequest(cookie, {
        service: 'people',
        method: 'GET',
        url: PEOPLE_URL,
      });
      assert.equal(res.status, 403);
      assert.equal((await res.json()).error.code, 'SCOPE_NOT_AUTHORIZED');
    } finally {
      cleanupLogin(userId, sessionId);
    }
  });

  it('returns 202 and processes the request asynchronously', async () => {
    const { userId, sessionId, cookie } = await createLogin();
    try {
      withGrant(userId, 'main', 'main-access-token');
      upstreamCalls = [];
      upstreamHandler = async (input, init) => {
        assert.equal(String(input), CALENDAR_URL);
        assert.equal(init.method, 'GET');
        // クライアント指定の Authorization は捨てて REALM のトークンを使う
        assert.equal(init.headers.get('authorization'), 'Bearer main-access-token');
        assert.equal(init.headers.get('x-goog-custom'), 'yes');
        assert.equal(init.headers.get('cookie'), null);
        return new Response(JSON.stringify({ items: [1] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      };

      const { result } = await runRequest(cookie, {
        service: 'calendar',
        method: 'GET',
        url: CALENDAR_URL,
        headers: {
          authorization: 'Bearer client-supplied',
          cookie: 'secret=1',
          'x-goog-custom': 'yes',
        },
        accessToken: 'should-be-ignored',
      });
      assert.equal(result.state, 'done');
      assert.equal(result.response.status, 200);
      assert.equal(result.response.headers['content-type'], 'application/json');
      assert.deepEqual(
        JSON.parse(decodeBody(result.response.bodyBase64).toString('utf8')),
        { items: [1] }
      );
      assert.equal(upstreamCalls.length, 1);

      // ApiRequestLog が記録されている
      const logs = realm.objects('ApiRequestLog').filtered('sessionId == $0', sessionId);
      assert.equal(logs.length, 1);
      assert.equal(logs[0].status, 200);
      assert.equal(logs[0].service, 'calendar');
    } finally {
      upstreamHandler = async () => new Response('{}', { status: 200 });
      cleanupLogin(userId, sessionId);
    }
  });

  it('sends decoded bodyBase64 bytes to the upstream API', async () => {
    const { userId, sessionId, cookie } = await createLogin();
    try {
      withGrant(userId, 'photo-sharing', 'photos-token');
      const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x01, 0x02]);
      upstreamCalls = [];
      upstreamHandler = async (input, init) => {
        const sent = Buffer.from(init.body);
        assert.deepEqual(new Uint8Array(sent), bytes);
        assert.equal(init.headers.get('x-goog-upload-protocol'), 'raw');
        return new Response('ok', { status: 200 });
      };

      const { result } = await runRequest(cookie, {
        service: 'photos',
        method: 'POST',
        url: 'https://photoslibrary.googleapis.com/v1/uploads',
        headers: {
          'content-type': 'application/octet-stream',
          'x-goog-upload-protocol': 'raw',
        },
        bodyBase64: Buffer.from(bytes).toString('base64'),
      });
      assert.equal(result.state, 'done');
      assert.equal(result.response.status, 200);
      assert.equal(decodeBody(result.response.bodyBase64).toString(), 'ok');
    } finally {
      upstreamHandler = async () => new Response('{}', { status: 200 });
      cleanupLogin(userId, sessionId);
    }
  });

  it('relays media downloads from googleusercontent as bodyBase64', async () => {
    const { userId, sessionId, cookie } = await createLogin();
    try {
      withGrant(userId, 'photo-sharing', 'photos-token');
      const media = new Uint8Array([1, 2, 3, 4, 5]);
      upstreamHandler = async () =>
        new Response(media, {
          status: 200,
          headers: { 'content-type': 'image/jpeg' },
        });

      const { result } = await runRequest(cookie, {
        service: 'photos',
        method: 'GET',
        url: MEDIA_URL,
      });
      assert.equal(result.state, 'done');
      assert.equal(result.response.headers['content-type'], 'image/jpeg');
      assert.deepEqual(new Uint8Array(decodeBody(result.response.bodyBase64)), media);
    } finally {
      upstreamHandler = async () => new Response('{}', { status: 200 });
      cleanupLogin(userId, sessionId);
    }
  });

  it('uses the envelope accessToken as a fallback when no grant exists', async () => {
    const { userId, sessionId, cookie } = await createLogin();
    try {
      upstreamCalls = [];
      upstreamHandler = async (input, init) => {
        assert.equal(init.headers.get('authorization'), 'Bearer fallback-token');
        return new Response('{}', { status: 200 });
      };
      const { result } = await runRequest(cookie, {
        service: 'people',
        method: 'GET',
        url: PEOPLE_URL,
        accessToken: 'fallback-token',
      });
      assert.equal(result.state, 'done');
      assert.equal(result.response.status, 200);
    } finally {
      upstreamHandler = async () => new Response('{}', { status: 200 });
      cleanupLogin(userId, sessionId);
    }
  });

  it('refreshes the token and retries once when upstream returns 401', async () => {
    const { userId, sessionId, cookie } = await createLogin();
    try {
      withGrant(userId, 'main', 'expired-looking-token');

      refreshStub = async () => ({
        credentials: {
          access_token: 'refreshed-token',
          expiry_date: Date.now() + 60 * 60 * 1000,
        },
      });

      const seenAuth = [];
      upstreamCalls = [];
      upstreamHandler = async (input, init) => {
        seenAuth.push(init.headers.get('authorization'));
        if (seenAuth.length === 1) {
          return new Response('{"error":"unauthorized"}', {
            status: 401,
            headers: { 'content-type': 'application/json' },
          });
        }
        return new Response('{"ok":true}', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      };

      const { result } = await runRequest(cookie, {
        service: 'calendar',
        method: 'GET',
        url: CALENDAR_URL,
      });
      assert.equal(result.state, 'done');
      assert.equal(result.response.status, 200);
      assert.deepEqual(seenAuth, [
        'Bearer expired-looking-token',
        'Bearer refreshed-token',
      ]);
      // REALM のグラントも更新されている
      assert.equal(getGrant(userId, 'main').accessToken, 'refreshed-token');
    } finally {
      refreshStub = null;
      upstreamHandler = async () => new Response('{}', { status: 200 });
      cleanupLogin(userId, sessionId);
    }
  });

  it('fails with 403 when refresh fails with invalid_grant', async () => {
    const { userId, sessionId, cookie } = await createLogin();
    try {
      withGrant(userId, 'main', 'dead-token');
      upstreamCalls = [];
      upstreamHandler = async () => new Response('unauthorized', { status: 401 });

      const { result } = await runRequest(cookie, {
        service: 'calendar',
        method: 'GET',
        url: CALENDAR_URL,
      });
      // invalid_grant → グラント破棄 → failed
      assert.equal(result.state, 'failed');
      assert.equal(result.error.status, 403);
      assert.equal(result.error.message, 'SCOPE_NOT_AUTHORIZED');
      assert.equal(getGrant(userId, 'main'), null);
      assert.equal(upstreamCalls.length, 1);
    } finally {
      cleanupLogin(userId, sessionId);
    }
  });
});

describe('POST /request (batch)', () => {
  it('returns 202 and returns per-element responses in the same order', async () => {
    const { userId, sessionId, cookie } = await createLogin();
    try {
      withGrant(userId, 'main', 'main-token');
      const urls = [];
      upstreamCalls = [];
      upstreamHandler = async (input, init) => {
        urls.push(String(input));
        assert.equal(init.headers.get('authorization'), 'Bearer main-token');
        if (String(input).includes('calendarList')) {
          return new Response('{"not":"found"}', {
            status: 404,
            headers: { 'content-type': 'application/json' },
          });
        }
        return new Response('{"items":[]}', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      };

      const { result } = await runRequest(cookie, {
        requests: [
          { service: 'calendar', method: 'GET', url: CALENDAR_URL },
          {
            service: 'calendar',
            method: 'GET',
            url: 'https://www.googleapis.com/calendar/v3/users/me/calendarList',
          },
        ],
      });
      assert.equal(result.state, 'done');
      assert.equal(result.responses.length, 2);
      assert.equal(result.responses[0].status, 200);
      assert.equal(result.responses[1].status, 404); // 要素の失敗はジョブを failed にしない
      assert.deepEqual(
        JSON.parse(decodeBody(result.responses[0].bodyBase64).toString('utf8')),
        { items: [] }
      );
      assert.equal(upstreamCalls.length, 2);
    } finally {
      upstreamHandler = async () => new Response('{}', { status: 200 });
      cleanupLogin(userId, sessionId);
    }
  });

  it('supports mixed services with per-element grants and fallback tokens', async () => {
    const { userId, sessionId, cookie } = await createLogin();
    try {
      withGrant(userId, 'main', 'main-token');
      const seenAuth = [];
      upstreamHandler = async (input, init) => {
        seenAuth.push(init.headers.get('authorization'));
        return new Response('{}', { status: 200 });
      };

      const { result } = await runRequest(cookie, {
        requests: [
          { service: 'calendar', method: 'GET', url: CALENDAR_URL },
          { service: 'people', method: 'GET', url: PEOPLE_URL, accessToken: 'people-fallback' },
        ],
      });
      assert.equal(result.state, 'done');
      assert.deepEqual(seenAuth, ['Bearer main-token', 'Bearer people-fallback']);
      assert.deepEqual(
        result.responses.map((/** @type {any} */ r) => r.status),
        [200, 200]
      );
    } finally {
      upstreamHandler = async () => new Response('{}', { status: 200 });
      cleanupLogin(userId, sessionId);
    }
  });

  it('rejects the whole batch when any element fails validation', async () => {
    const { userId, sessionId, cookie } = await createLogin();
    try {
      withGrant(userId, 'main', 'main-token');
      upstreamCalls = [];
      const res = await postRequest(cookie, {
        requests: [
          { service: 'calendar', method: 'GET', url: CALENDAR_URL },
          { service: 'calendar', method: 'GET', url: 'https://evil.example.com/x' },
        ],
      });
      assert.equal(res.status, 400);

      // 部分投入されていないこと
      const res2 = await postRequest(cookie, {
        requests: [
          { service: 'people', method: 'GET', url: PEOPLE_URL }, // グラント無し → 403
          { service: 'calendar', method: 'GET', url: CALENDAR_URL },
        ],
      });
      assert.equal(res2.status, 403);

      await drainApiRequests();
      assert.equal(upstreamCalls.length, 0);
    } finally {
      cleanupLogin(userId, sessionId);
    }
  });

  it('rejects empty or oversized batches', async () => {
    const { userId, sessionId, cookie } = await createLogin();
    try {
      let res = await postRequest(cookie, { requests: [] });
      assert.equal(res.status, 400);

      res = await postRequest(cookie, {
        requests: Array.from({ length: 51 }, () => ({
          service: 'calendar',
          method: 'GET',
          url: CALENDAR_URL,
        })),
      });
      assert.equal(res.status, 400);
    } finally {
      cleanupLogin(userId, sessionId);
    }
  });

  it('stores element-level 403 when the grant disappears before the worker runs', async () => {
    const { userId, sessionId, cookie } = await createLogin();
    try {
      withGrant(userId, 'main', 'main-token');
      upstreamCalls = [];
      upstreamHandler = async () => new Response('{}', { status: 200 });

      const res = await postRequest(cookie, {
        requests: [
          { service: 'calendar', method: 'GET', url: CALENDAR_URL },
          { service: 'calendar', method: 'GET', url: CALENDAR_URL + '&x=1' },
        ],
      });
      assert.equal(res.status, 202);
      const { requestId } = await res.json();

      // 投入後・ワーカー実行前にグラントを削除する
      realm.write(() => {
        const g = realm.objectForPrimaryKey('OAuthGrant', `${userId}/main`);
        if (g) {
          realm.delete(g);
        }
      });
      await drainApiRequests();

      const result = await (await getRequest(cookie, requestId)).json();
      assert.equal(result.state, 'done');
      assert.equal(result.responses.length, 2);
      for (const r of result.responses) {
        assert.equal(r.status, 403);
      }
      assert.equal(upstreamCalls.length, 0);
    } finally {
      upstreamHandler = async () => new Response('{}', { status: 200 });
      cleanupLogin(userId, sessionId);
    }
  });

  it('retries a batch element once on upstream 401', async () => {
    const { userId, sessionId, cookie } = await createLogin();
    try {
      withGrant(userId, 'main', 'old-token');
      refreshStub = async () => ({
        credentials: {
          access_token: 'fresh-token',
          expiry_date: Date.now() + 60 * 60 * 1000,
        },
      });
      const seenAuth = [];
      upstreamCalls = [];
      upstreamHandler = async (input, init) => {
        seenAuth.push(init.headers.get('authorization'));
        if (seenAuth.length === 1) {
          return new Response('{}', { status: 401 });
        }
        return new Response('{"ok":true}', { status: 200 });
      };

      const { result } = await runRequest(cookie, {
        requests: [
          { service: 'calendar', method: 'GET', url: CALENDAR_URL },
          { service: 'calendar', method: 'GET', url: CALENDAR_URL + '&x=2' },
        ],
      });
      assert.equal(result.state, 'done');
      assert.deepEqual(seenAuth, [
        'Bearer old-token', // 要素1 初回 401
        'Bearer fresh-token', // 要素1 リトライ
        'Bearer fresh-token', // 要素2 は更新済みトークン
      ]);
      assert.deepEqual(
        result.responses.map((/** @type {any} */ r) => r.status),
        [200, 200]
      );
    } finally {
      refreshStub = null;
      upstreamHandler = async () => new Response('{}', { status: 200 });
      cleanupLogin(userId, sessionId);
    }
  });
});

describe('POST /request (drive)', () => {
  const DRIVE_LIST_URL =
    "https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name='orbit-sync.json'&fields=files(id,name,modifiedTime)";
  const DRIVE_UPLOAD_URL =
    'https://www.googleapis.com/upload/drive/v3/files/file-1?uploadType=media&fields=id,name,modifiedTime';
  const DRIVE_MEDIA_URL = 'https://www.googleapis.com/drive/v3/files/file-1?alt=media';

  it('rejects non-drive URLs for the drive service', async () => {
    const { userId, sessionId, cookie } = await createLogin();
    try {
      withGrant(userId, 'drive', 'drive-token');
      for (const url of [
        CALENDAR_URL, // /drive/ でも /upload/drive/ でもない
        'https://www.googleapis.com/drivex/v3/files', // 前方一致だが /drive/ ではない
        'https://drive.google.com/v3/files',
        'http://www.googleapis.com/drive/v3/files',
      ]) {
        const res = await postRequest(cookie, { service: 'drive', method: 'GET', url });
        assert.equal(res.status, 400, url);
      }
    } finally {
      cleanupLogin(userId, sessionId);
    }
  });

  it('relays files list/get and PATCH uploadType=media', async () => {
    const { userId, sessionId, cookie } = await createLogin();
    try {
      withGrant(userId, 'drive', 'drive-token');
      upstreamCalls = [];
      upstreamHandler = async (input, init) => {
        assert.equal(init.headers.get('authorization'), 'Bearer drive-token');
        return new Response('{"files":[]}', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      };

      // files list
      const list = await runRequest(cookie, {
        service: 'drive',
        method: 'GET',
        url: DRIVE_LIST_URL,
      });
      assert.equal(list.result.state, 'done');
      assert.equal(list.result.response.status, 200);

      // files.get?alt=media（JSON テキストボディ）
      const get = await runRequest(cookie, {
        service: 'drive',
        method: 'GET',
        url: DRIVE_MEDIA_URL,
      });
      assert.equal(get.result.state, 'done');
      assert.deepEqual(
        JSON.parse(decodeBody(get.result.response.bodyBase64).toString('utf8')),
        { files: [] }
      );

      // PATCH uploadType=media（JSON テキストを bodyBase64 で送信）
      const payload = Buffer.from(JSON.stringify({ version: 1, prefs: {} }), 'utf8');
      upstreamHandler = async (input, init) => {
        assert.equal(init.method, 'PATCH');
        assert.equal(init.headers.get('content-type'), 'application/json');
        assert.deepEqual(Buffer.from(init.body), payload);
        return new Response('{"id":"file-1"}', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      };
      const patch = await runRequest(cookie, {
        service: 'drive',
        method: 'PATCH',
        url: DRIVE_UPLOAD_URL,
        headers: { 'content-type': 'application/json' },
        bodyBase64: payload.toString('base64'),
      });
      assert.equal(patch.result.state, 'done');
      assert.equal(patch.result.response.status, 200);
      assert.equal(upstreamCalls.length, 3);
    } finally {
      upstreamHandler = async () => new Response('{}', { status: 200 });
      cleanupLogin(userId, sessionId);
    }
  });

  it('returns 403 when the drive grant does not exist', async () => {
    const { userId, sessionId, cookie } = await createLogin();
    try {
      const res = await postRequest(cookie, {
        service: 'drive',
        method: 'GET',
        url: DRIVE_LIST_URL,
      });
      assert.equal(res.status, 403);
      assert.equal((await res.json()).error.code, 'SCOPE_NOT_AUTHORIZED');
    } finally {
      cleanupLogin(userId, sessionId);
    }
  });
});

describe('GET /request/:id', () => {
  it('returns 401 without a session cookie', async () => {
    const res = await app.request(`/request/${crypto.randomUUID()}`);
    assert.equal(res.status, 401);
  });

  it('returns pending while the request is being processed', async () => {
    const { userId, sessionId, cookie } = await createLogin();
    let requestId;
    try {
      // processing 状態の ApiRequest を直接作る（2分以内なら stale 回収されない）
      requestId = crypto.randomUUID();
      realm.write(() => {
        realm.create('ApiRequest', {
          id: requestId,
          sessionId,
          userId,
          state: 'processing',
          isBatch: false,
          service: 'calendar',
          method: 'GET',
          url: CALENDAR_URL,
          attempts: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          expiresAt: null,
        });
      });

      const res = await getRequest(cookie, requestId);
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { state: 'pending' });
    } finally {
      realm.write(() => {
        const req = realm.objectForPrimaryKey('ApiRequest', requestId);
        if (req) {
          realm.delete(req);
        }
      });
      cleanupLogin(userId, sessionId);
    }
  });

  it('returns 404 for another user\'s requestId (IDOR guard)', async () => {
    const a = await createLogin();
    const b = await createLogin();
    try {
      const res = await postRequest(a.cookie, {
        service: 'people',
        method: 'GET',
        url: PEOPLE_URL,
        accessToken: 'fallback-token',
      });
      assert.equal(res.status, 202);
      const { requestId } = await res.json();
      await drainApiRequests();

      const resB = await getRequest(b.cookie, requestId);
      assert.equal(resB.status, 404);

      // 投入者本人は結果を取得できる
      const resA = await getRequest(a.cookie, requestId);
      assert.equal(resA.status, 200);
      assert.equal((await resA.json()).state, 'done');
    } finally {
      cleanupLogin(a.userId, a.sessionId);
      cleanupLogin(b.userId, b.sessionId);
    }
  });

  it('returns 404 for an unknown requestId', async () => {
    const { userId, sessionId, cookie } = await createLogin();
    try {
      const res = await getRequest(cookie, crypto.randomUUID());
      assert.equal(res.status, 404);
    } finally {
      cleanupLogin(userId, sessionId);
    }
  });

  it('returns 410 for an expired result', async () => {
    const { userId, sessionId, cookie } = await createLogin();
    const requestId = crypto.randomUUID();
    try {
      realm.write(() => {
        realm.create('ApiRequest', {
          id: requestId,
          sessionId,
          userId,
          state: 'done',
          isBatch: false,
          service: 'calendar',
          method: 'GET',
          url: CALENDAR_URL,
          attempts: 1,
          status: 200,
          responseHeadersJson: '{}',
          responseBodyBase64: '',
          createdAt: new Date(),
          updatedAt: new Date(),
          expiresAt: new Date(Date.now() - 1000), // 既に期限切れ
        });
      });

      const res = await getRequest(cookie, requestId);
      assert.equal(res.status, 410);
      assert.equal(realm.objectForPrimaryKey('ApiRequest', requestId), null);
    } finally {
      cleanupLogin(userId, sessionId);
    }
  });
});
