import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

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
// テスト専用の Realm ファイルを使う（index.js 読み込み前に設定が必要）
process.env.REALM_PATH = '/tmp/orbit-bff-location-test.realm';

const { app, redis, realm, SESSION_SECRET, createSession, upsertUser } = await import(
  '@/index.js'
);
const {
  locationDeps,
  extractLocationInfo,
  isAllowedMapsUrl,
  isPrivateIp,
  clearLocationCache,
} = await import('@/services/location.js');

// --- 外部取得のスタブ ---
// globalThis.fetch と DNS 解決を差し替えて実通信を発生させない
/** @type {(input: any, init: any) => Promise<Response>} */
let upstreamHandler = async () =>
  new Response('<html></html>', {
    status: 200,
    headers: { 'content-type': 'text/html' },
  });
/** @type {{ url: string, init: any }[]} */
let upstreamCalls = [];
/** @type {{ address: string, family: number }[]} */
let lookupResult = [{ address: '142.250.196.142', family: 4 }];
/** @type {null | (() => Promise<never>)} */
let lookupError = null;

const realFetch = globalThis.fetch;
const realLookup = locationDeps.lookup;

before(() => {
  globalThis.fetch = (input, init) => {
    upstreamCalls.push({ url: String(input), init });
    return upstreamHandler(input, init);
  };
  locationDeps.lookup = async () => {
    if (lookupError) {
      return lookupError();
    }
    return lookupResult;
  };
});

after(() => {
  globalThis.fetch = realFetch;
  locationDeps.lookup = realLookup;
  redis.disconnect();
  realm.close();
  // Realm の内部スレッドがイベントループを保持してプロセスが終了しないため、
  // 出力を流し切ったあと明示的に終了する
  setTimeout(() => process.exit(0), 100).unref();
});

beforeEach(() => {
  upstreamCalls = [];
  lookupResult = [{ address: '142.250.196.142', family: 4 }];
  lookupError = null;
  clearLocationCache();
  upstreamHandler = async () =>
    new Response('<html></html>', {
      status: 200,
      headers: { 'content-type': 'text/html' },
    });
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
    const user = realm.objectForPrimaryKey('User', userId);
    if (user) {
      realm.delete(user);
    }
  });
};

const getLocation = (/** @type {string} */ cookie, /** @type {string} */ url) =>
  app.request(`/api/location?url=${encodeURIComponent(url)}`, {
    headers: { cookie },
  });

const MAPS_HTML = `<!doctype html><html><head>
<title>カフェ・ド・クリエ - Google マップ</title>
<meta content="カフェ・ド・クリエ - Google マップ" property="og:title">
<meta name="description" content="東京都港区北青山3-5-6">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Place","name":"別名","address":{"@type":"PostalAddress","streetAddress":"北青山3-5-6","addressLocality":"港区","addressCountry":"JP"}}</script>
</head><body></body></html>`;

const htmlResponse = (/** @type {string} */ html, status = 200) =>
  new Response(html, { status, headers: { 'content-type': 'text/html; charset=utf-8' } });

describe('GET /api/location', () => {
  it('returns 401 without a session cookie', async () => {
    const res = await app.request(
      `/api/location?url=${encodeURIComponent('https://maps.app.goo.gl/abc')}`
    );
    assert.equal(res.status, 401);
  });

  it('returns 400 when url param is missing', async () => {
    const { userId, sessionId, cookie } = await createLogin();
    const res = await app.request('/api/location', { headers: { cookie } });
    assert.equal(res.status, 400);
    cleanupLogin(userId, sessionId);
  });

  it('returns 400 for unparsable / non-http(s) urls', async () => {
    const { userId, sessionId, cookie } = await createLogin();
    for (const bad of ['not a url', 'javascript:alert(1)', 'ftp://example.com/x']) {
      const res = await getLocation(cookie, bad);
      assert.equal(res.status, 400, bad);
    }
    cleanupLogin(userId, sessionId);
  });

  it('returns 400 for non-Google-Maps URLs', async () => {
    const { userId, sessionId, cookie } = await createLogin();
    for (const bad of [
      'https://example.com/maps',
      'https://www.google.com.evil.com/maps',
      'https://google.com.evil.com/maps',
      'https://www.google.com/',
      'https://goo.gl/other',
    ]) {
      const res = await getLocation(cookie, bad);
      assert.equal(res.status, 400, bad);
      const body = await res.json();
      assert.equal(body.error, 'NOT_GOOGLE_MAPS_URL', bad);
    }
    assert.equal(upstreamCalls.length, 0, '非 Maps URL は fetch されない');
    cleanupLogin(userId, sessionId);
  });

  it('returns 400 BLOCKED_HOST when DNS resolves to a private IP', async () => {
    lookupResult = [{ address: '192.168.1.1', family: 4 }];
    const { userId, sessionId, cookie } = await createLogin();
    const res = await getLocation(cookie, 'https://www.google.com/maps/place/x');
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error, 'BLOCKED_HOST');
    assert.equal(upstreamCalls.length, 0);
    cleanupLogin(userId, sessionId);
  });

  it('returns name/address from a place page (via short URL redirect)', async () => {
    const { userId, sessionId, cookie } = await createLogin();
    const finalUrl = 'https://www.google.com/maps/place/%E3%82%AB%E3%83%95%E3%82%A7/@35.6,139.7';
    upstreamHandler = async (input) => {
      if (String(input).includes('maps.app.goo.gl')) {
        return new Response(null, {
          status: 302,
          headers: { location: finalUrl },
        });
      }
      return htmlResponse(MAPS_HTML);
    };
    const res = await getLocation(cookie, 'https://maps.app.goo.gl/abc123');
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.name, 'カフェ・ド・クリエ'); // og:title の " - Google マップ" を除去
    assert.equal(body.address, '北青山3-5-6 港区 JP'); // JSON-LD PostalAddress
    assert.equal(upstreamCalls.length, 2);
    assert.ok(upstreamCalls[0].init.redirect === 'manual');
    cleanupLogin(userId, sessionId);
  });

  it('caches the result and skips re-fetching the same URL', async () => {
    const { userId, sessionId, cookie } = await createLogin();
    upstreamHandler = async () => htmlResponse(MAPS_HTML);
    const url = 'https://www.google.com/maps/place/cache-test';
    const res1 = await getLocation(cookie, url);
    const res2 = await getLocation(cookie, url);
    assert.equal(res1.status, 200);
    assert.equal(res2.status, 200);
    assert.equal(upstreamCalls.length, 1);
    cleanupLogin(userId, sessionId);
  });

  it('returns 404 when no place info can be extracted', async () => {
    const { userId, sessionId, cookie } = await createLogin();
    upstreamHandler = async () => htmlResponse('<html><head><title></title></head></html>');
    const res = await getLocation(cookie, 'https://www.google.com/maps/search/cafe');
    assert.equal(res.status, 404);
    cleanupLogin(userId, sessionId);
  });

  it('returns 404 for non-HTML responses', async () => {
    const { userId, sessionId, cookie } = await createLogin();
    upstreamHandler = async () =>
      new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    const res = await getLocation(cookie, 'https://maps.app.goo.gl/json');
    assert.equal(res.status, 404);
    cleanupLogin(userId, sessionId);
  });

  it('returns 502 for non-2xx upstream responses', async () => {
    const { userId, sessionId, cookie } = await createLogin();
    upstreamHandler = async () => new Response('nope', { status: 500 });
    const res = await getLocation(cookie, 'https://maps.app.goo.gl/err');
    assert.equal(res.status, 502);
    cleanupLogin(userId, sessionId);
  });

  it('returns 502 when DNS resolution fails', async () => {
    lookupError = async () => {
      throw Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' });
    };
    const { userId, sessionId, cookie } = await createLogin();
    const res = await getLocation(cookie, 'https://www.google.com/maps/place/x');
    assert.equal(res.status, 502);
    cleanupLogin(userId, sessionId);
  });

  it('rejects redirects to non-Maps domains (SSRF via redirect)', async () => {
    const { userId, sessionId, cookie } = await createLogin();
    upstreamHandler = async () =>
      new Response(null, { status: 302, headers: { location: 'https://evil.internal/x' } });
    const res = await getLocation(cookie, 'https://maps.app.goo.gl/evil');
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error, 'NOT_GOOGLE_MAPS_URL');
    cleanupLogin(userId, sessionId);
  });

  it('returns 502 after exceeding the redirect limit', async () => {
    const { userId, sessionId, cookie } = await createLogin();
    upstreamHandler = async (input) =>
      new Response(null, {
        status: 302,
        headers: { location: 'https://maps.app.goo.gl/next' },
      });
    const res = await getLocation(cookie, 'https://maps.app.goo.gl/loop');
    assert.equal(res.status, 502);
    const body = await res.json();
    assert.equal(body.error, 'TOO_MANY_REDIRECTS');
    assert.equal(upstreamCalls.length, 6); // 初回 + 5 リダイレクト
    cleanupLogin(userId, sessionId);
  });

  it('returns 504 when the upstream fetch times out', async () => {
    const { userId, sessionId, cookie } = await createLogin();
    upstreamHandler = async () => {
      throw Object.assign(new Error('The operation timed out'), { name: 'TimeoutError' });
    };
    const res = await getLocation(cookie, 'https://maps.app.goo.gl/slow');
    assert.equal(res.status, 504);
    const body = await res.json();
    assert.equal(body.error, 'TIMEOUT');
    cleanupLogin(userId, sessionId);
  });
});

describe('isAllowedMapsUrl', () => {
  it('accepts Google Maps domain forms', () => {
    for (const u of [
      'https://www.google.com/maps/place/x',
      'https://google.com/maps',
      'https://www.google.co.jp/maps/place/x',
      'https://maps.google.com/',
      'https://maps.google.co.jp/anything',
      'https://maps.app.goo.gl/abc',
      'https://goo.gl/maps/abc',
    ]) {
      assert.equal(isAllowedMapsUrl(new URL(u)), true, u);
    }
  });

  it('rejects non-Maps or lookalike hosts', () => {
    for (const u of [
      'https://www.google.com/', // /maps 以外のパス
      'https://www.google.com/search?q=maps',
      'https://goo.gl/other',
      'https://app.goo.gl/x',
      'https://evilgoogle.com/maps',
      'https://www.google.com.evil.com/maps',
      'https://google.com.evil.com/maps',
      'https://www.google.com:9999@evil.com/maps', // hostname が evil.com
      'http://localhost:8787/maps',
      'https://example.com/maps',
    ]) {
      assert.equal(isAllowedMapsUrl(new URL(u)), false, u);
    }
  });
});

describe('isPrivateIp', () => {
  it('detects private IPv4 ranges', () => {
    for (const ip of [
      '127.0.0.1',
      '10.0.0.1',
      '172.16.0.1',
      '172.31.255.1',
      '192.168.0.1',
      '169.254.169.254', // クラウドメタデータ
      '100.64.0.1',
      '0.0.0.0',
      '224.0.0.1',
    ]) {
      assert.equal(isPrivateIp(ip), true, ip);
    }
    for (const ip of ['8.8.8.8', '172.32.0.1', '142.250.196.142', '1.1.1.1']) {
      assert.equal(isPrivateIp(ip), false, ip);
    }
  });

  it('detects private IPv6 ranges', () => {
    for (const ip of [
      '::1',
      '::',
      'fe80::1',
      'fd00::1',
      '::ffff:127.0.0.1', // IPv4-mapped
      '0:0:0:0:0:ffff:0a00:0001', // ::ffff:10.0.0.1（16進形式）
      'ff02::1',
    ]) {
      assert.equal(isPrivateIp(ip), true, ip);
    }
    for (const ip of ['2606:4700:4700::1111', '::ffff:8.8.8.8']) {
      assert.equal(isPrivateIp(ip), false, ip);
    }
  });
});

describe('extractLocationInfo', () => {
  const finalUrl = new URL('https://www.google.com/maps/place/x/@35.6,139.7');

  it('uses og:title first and strips the Google Maps suffix', () => {
    const info = extractLocationInfo(
      '<html><head><meta property="og:title" content="Place &amp; Co - Google Maps">' +
        '<title>other - Google マップ</title></head></html>',
      finalUrl
    );
    assert.equal(info.name, 'Place & Co');
  });

  it('falls back to <title> with the Japanese suffix', () => {
    const info = extractLocationInfo(
      '<html><head><title>渋谷ストリーム - Google マップ</title></head></html>',
      finalUrl
    );
    assert.equal(info.name, '渋谷ストリーム');
  });

  it('reads name and address from JSON-LD Place', () => {
    const html =
      '<script type="application/ld+json">' +
      '{"@type":"Place","name":"LD Place","address":"東京都千代田区1-1"}' +
      '</script>';
    const info = extractLocationInfo(html, finalUrl);
    assert.equal(info.name, 'LD Place');
    assert.equal(info.address, '東京都千代田区1-1');
  });

  it('uses the /maps/place/ path segment as a name fallback', () => {
    const info = extractLocationInfo(
      '<html></html>',
      new URL('https://www.google.com/maps/place/Foo%20Bar/@1,2')
    );
    assert.equal(info.name, 'Foo Bar');
  });

  it('does not return Google\'s generic site description as an address', () => {
    const html =
      '<meta name="description" content="Google マップで地図を検索。乗換案内、路線図…">' +
      '<meta property="og:description" content="Find local businesses, view maps and get driving directions in Google Maps.">' +
      '<meta itemprop="description" content="Find local businesses, view maps in Google Maps.">';
    const info = extractLocationInfo(html, finalUrl);
    assert.equal(info.address, null);
    assert.equal(info.name, 'x'); // /place/ URL fallback
  });

  it('returns nulls when nothing is extractable', () => {
    // /place/ パスを含まない URL なら URL fallback も効かない
    const searchUrl = new URL('https://www.google.com/maps/search/cafe');
    const info = extractLocationInfo(
      '<html><head><title>Google マップ</title></head></html>',
      searchUrl
    );
    assert.equal(info.name, null);
    assert.equal(info.address, null);
  });
});
