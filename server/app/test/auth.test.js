import { after, before, describe, it } from 'node:test';
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

const { app, redis, SESSION_SECRET } = await import('../src/index.js');

let redisAvailable = false;

before(async () => {
  redisAvailable = await Promise.race([
    redis
      .ping()
      .then((r) => r === 'PONG')
      .catch(() => false),
    new Promise((resolve) => setTimeout(() => resolve(false), 3000)),
  ]);
});

after(() => {
  redis.disconnect();
});

/** @param {Response} res */
const googleAuthUrl = (res) => {
  assert.equal(res.status, 302);
  const location = res.headers.get('location');
  assert.ok(location, 'Location header should be present');
  const url = new URL(location);
  assert.equal(url.hostname, 'accounts.google.com');
  return url;
};

describe('GET /auth/login', () => {
  it('redirects to Google with the default prompt=consent when prompt is not given', async () => {
    const res = await app.request('/auth/login');
    const url = googleAuthUrl(res);
    assert.equal(url.searchParams.get('prompt'), 'consent');
    assert.equal(url.searchParams.get('access_type'), 'offline');
  });

  it('forwards ?prompt=select_account to the Google authorization URL', async () => {
    const res = await app.request('/auth/login?prompt=select_account');
    const url = googleAuthUrl(res);
    assert.equal(url.searchParams.get('prompt'), 'select_account');
  });

  it('accepts multiple space-separated valid tokens', async () => {
    const res = await app.request(
      `/auth/login?prompt=${encodeURIComponent('consent select_account')}`
    );
    const url = googleAuthUrl(res);
    assert.equal(url.searchParams.get('prompt'), 'consent select_account');
  });

  it('treats an empty prompt as not specified', async () => {
    const res = await app.request('/auth/login?prompt=');
    const url = googleAuthUrl(res);
    assert.equal(url.searchParams.get('prompt'), 'consent');
  });

  it('returns 400 for an invalid prompt value', async () => {
    const res = await app.request('/auth/login?prompt=invalid_value');
    assert.equal(res.status, 400);
  });

  it('returns 400 when any token in a list is invalid', async () => {
    const res = await app.request(
      `/auth/login?prompt=${encodeURIComponent('select_account bogus')}`
    );
    assert.equal(res.status, 400);
  });
});

describe('GET /api/token', () => {
  it('discards a dead refresh token when Google returns invalid_grant', async (t) => {
    if (!redisAvailable) {
      t.skip('Redis is not reachable');
      return;
    }

    const sessionId = crypto.randomUUID();
    const key = `session:${sessionId}`;
    await redis.set(key, 'fake-refresh-token');

    const signature = await signCookie(sessionId, SESSION_SECRET);
    const cookie = `session_id=${encodeURIComponent(`${sessionId}.${signature}`)}`;

    const res = await app.request('/api/token', {
      headers: { Cookie: cookie },
    });
    assert.equal(res.status, 401);

    const { error } = await res.json();
    if (error === 'UNAUTHORIZED') {
      // Google が invalid_grant を返した場合、キーは破棄されているはず
      assert.equal(await redis.get(key), null);
    } else {
      // クライアント認証情報が無効等で invalid_grant 以外の場合はキーが残る
      assert.equal(error, 'TOKEN_REFRESH_FAILED');
      await redis.del(key);
    }
  });
});

describe('GET /auth/photo-sharing', () => {
  it('redirects to /auth/login when there is no session', async () => {
    const res = await app.request('/auth/photo-sharing');
    assert.equal(res.status, 302);
    assert.equal(res.headers.get('location'), '/auth/login');
  });
});

describe('POST /auth/logout', () => {
  it('clears the session cookie even without a session', async () => {
    const res = await app.request('/auth/logout', { method: 'POST' });
    assert.equal(res.status, 200);
    const setCookie = res.headers.get('set-cookie');
    assert.ok(setCookie, 'Set-Cookie header should be present');
    assert.match(setCookie, /session_id=;/);
    assert.match(setCookie, /max-age=0/i);
  });

  it('deletes the session and photo-sharing keys, then /api/token returns 401', async (t) => {
    if (!redisAvailable) {
      t.skip('Redis is not reachable');
      return;
    }

    const sessionId = crypto.randomUUID();
    await redis.set(`session:${sessionId}`, 'fake-refresh-token');
    await redis.set(`session:${sessionId}:photo-sharing`, 'fake-photo-token');

    const signature = await signCookie(sessionId, SESSION_SECRET);
    const cookie = `session_id=${encodeURIComponent(`${sessionId}.${signature}`)}`;

    const res = await app.request('/auth/logout', {
      method: 'POST',
      headers: { Cookie: cookie },
    });
    assert.equal(res.status, 200);

    assert.equal(await redis.get(`session:${sessionId}`), null);
    assert.equal(await redis.get(`session:${sessionId}:photo-sharing`), null);

    const tokenRes = await app.request('/api/token', {
      headers: { Cookie: cookie },
    });
    assert.equal(tokenRes.status, 401);
  });
});
