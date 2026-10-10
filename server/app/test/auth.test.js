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
// テスト専用の Realm ファイルを使う（index.js 読み込み前に設定が必要）
process.env.REALM_PATH = '/tmp/orbit-bff-auth-test.realm';

const {
  app,
  redis,
  realm,
  SESSION_SECRET,
  createSession,
  upsertUser,
  upsertGrant,
  getGrant,
} = await import('../src/index.js');

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
  realm.close();
  // Realm の内部スレッドがイベントループを保持してプロセスが終了しないため、
  // 出力を流し切ったあと明示的に終了する
  setTimeout(() => process.exit(0), 100).unref();
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
  });
};

describe('GET /auth/login', () => {
  it('redirects to Google with the default prompt=consent when prompt is not given', async () => {
    const res = await app.request('/auth/login');
    const url = googleAuthUrl(res);
    assert.equal(url.searchParams.get('prompt'), 'consent');
    assert.equal(url.searchParams.get('access_type'), 'offline');
  });

  it('does not request People or Drive scopes at main login', async () => {
    const res = await app.request('/auth/login');
    const url = googleAuthUrl(res);
    const scope = url.searchParams.get('scope') ?? '';
    assert.match(scope, /auth\/calendar/);
    assert.doesNotMatch(scope, /contacts/);
    assert.doesNotMatch(scope, /drive/);
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
  it('returns the stored access token when the grant is still valid', async () => {
    const { userId, sessionId, cookie } = await createLogin();
    try {
      upsertGrant(userId, 'main', {
        accessToken: 'stored-access-token',
        refreshToken: 'rt',
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      });

      const res = await app.request('/api/token', { headers: { Cookie: cookie } });
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { gAccessToken: 'stored-access-token' });
    } finally {
      cleanupLogin(userId, sessionId);
    }
  });

  it('returns 401 when there is no session and no grant', async () => {
    const res = await app.request('/api/token');
    assert.equal(res.status, 401);
  });

  it('discards a dead refresh token when Google returns invalid_grant', async () => {
    const { userId, sessionId, cookie } = await createLogin();
    try {
      upsertGrant(userId, 'main', { refreshToken: 'fake-refresh-token' });

      const res = await app.request('/api/token', { headers: { Cookie: cookie } });
      assert.equal(res.status, 401);

      const { error } = await res.json();
      if (error === 'UNAUTHORIZED') {
        // Google が invalid_grant を返した場合、グラントは破棄されているはず
        assert.equal(getGrant(userId, 'main'), null);
      } else {
        // ネットワーク不通など invalid_grant 以外の場合はグラントが残る
        assert.equal(error, 'TOKEN_REFRESH_FAILED');
      }
    } finally {
      cleanupLogin(userId, sessionId);
    }
  });

  it('returns 404 PEOPLE_NOT_AUTHORIZED for t=people without a grant', async () => {
    const { userId, sessionId, cookie } = await createLogin();
    try {
      const res = await app.request('/api/token?t=people', {
        headers: { Cookie: cookie },
      });
      assert.equal(res.status, 404);
      assert.deepEqual(await res.json(), { error: 'PEOPLE_NOT_AUTHORIZED' });
    } finally {
      cleanupLogin(userId, sessionId);
    }
  });

  it('returns the people access token when a people grant exists', async () => {
    const { userId, sessionId, cookie } = await createLogin();
    try {
      upsertGrant(userId, 'people', {
        accessToken: 'people-token',
        refreshToken: 'rt',
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      });
      const res = await app.request('/api/token?t=people', {
        headers: { Cookie: cookie },
      });
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { gAccessToken: 'people-token' });
    } finally {
      cleanupLogin(userId, sessionId);
    }
  });

  it('returns 400 for an unsupported token type', async () => {
    const res = await app.request('/api/token?t=bogus');
    assert.equal(res.status, 400);
  });
});

describe('GET /auth/photo-sharing', () => {
  it('redirects to /auth/login when there is no session', async () => {
    const res = await app.request('/auth/photo-sharing');
    assert.equal(res.status, 302);
    assert.equal(res.headers.get('location'), '/auth/login');
  });
});

describe('GET /auth/people', () => {
  it('redirects to /auth/login when there is no session', async () => {
    const res = await app.request('/auth/people');
    assert.equal(res.status, 302);
    assert.equal(res.headers.get('location'), '/auth/login');
  });

  it('redirects to Google with the People scopes when logged in', async (t) => {
    if (!redisAvailable) {
      t.skip('Redis is not reachable');
      return;
    }
    const { userId, sessionId, cookie } = await createLogin();
    try {
      const res = await app.request('/auth/people', {
        headers: { Cookie: cookie },
      });
      const url = googleAuthUrl(res);
      const scope = url.searchParams.get('scope') ?? '';
      assert.match(scope, /contacts\.readonly/);
      assert.match(scope, /contacts\.other\.readonly/);
      const state = url.searchParams.get('state');
      assert.ok(state);
      // 後始末（state はワンタイムだが残っていれば消す）
      await redis.del(`auth-state:${state}`);
    } finally {
      cleanupLogin(userId, sessionId);
    }
  });
});

describe('GET /auth/drive', () => {
  it('redirects to /auth/login when there is no session', async () => {
    const res = await app.request('/auth/drive');
    assert.equal(res.status, 302);
    assert.equal(res.headers.get('location'), '/auth/login');
  });

  it('redirects to Google with the drive.appdata scope when logged in', async (t) => {
    if (!redisAvailable) {
      t.skip('Redis is not reachable');
      return;
    }
    const { userId, sessionId, cookie } = await createLogin();
    try {
      const res = await app.request('/auth/drive', {
        headers: { Cookie: cookie },
      });
      const url = googleAuthUrl(res);
      const scope = url.searchParams.get('scope') ?? '';
      assert.match(scope, /drive\.appdata/);
      assert.doesNotMatch(scope, /drive\.file|drive\.readonly|\bdrive\b(?!\.appdata)/);
      const state = url.searchParams.get('state');
      assert.ok(state);
      await redis.del(`auth-state:${state}`);
    } finally {
      cleanupLogin(userId, sessionId);
    }
  });
});

describe('GET /api/token?t=drive', () => {
  it('returns 404 DRIVE_NOT_AUTHORIZED without a drive grant', async () => {
    const { userId, sessionId, cookie } = await createLogin();
    try {
      const res = await app.request('/api/token?t=drive', {
        headers: { Cookie: cookie },
      });
      assert.equal(res.status, 404);
      assert.deepEqual(await res.json(), { error: 'DRIVE_NOT_AUTHORIZED' });
    } finally {
      cleanupLogin(userId, sessionId);
    }
  });

  it('returns the drive access token when a drive grant exists', async () => {
    const { userId, sessionId, cookie } = await createLogin();
    try {
      upsertGrant(userId, 'drive', {
        accessToken: 'drive-token',
        refreshToken: 'rt',
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      });
      const res = await app.request('/api/token?t=drive', {
        headers: { Cookie: cookie },
      });
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { gAccessToken: 'drive-token' });
    } finally {
      cleanupLogin(userId, sessionId);
    }
  });
});

describe('GET /enable', () => {
  it('returns 400 for an unsupported enable type', async () => {
    const res = await app.request('/enable?t=bogus&code=x&state=y');
    assert.equal(res.status, 400);
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

  it('deletes the session and grants, then /api/token returns 401', async () => {
    const { userId, sessionId, cookie } = await createLogin();
    try {
      upsertGrant(userId, 'main', { refreshToken: 'fake-refresh-token' });
      upsertGrant(userId, 'photo-sharing', { refreshToken: 'fake-photo-token' });

      const res = await app.request('/auth/logout', {
        method: 'POST',
        headers: { Cookie: cookie },
      });
      assert.equal(res.status, 200);

      assert.equal(realm.objectForPrimaryKey('Session', sessionId), null);
      assert.equal(getGrant(userId, 'main'), null);
      assert.equal(getGrant(userId, 'photo-sharing'), null);

      const tokenRes = await app.request('/api/token', {
        headers: { Cookie: cookie },
      });
      assert.equal(tokenRes.status, 401);
    } finally {
      cleanupLogin(userId, sessionId);
    }
  });

  it('keeps grants while other sessions for the user remain', async () => {
    const { userId, sessionId, cookie } = await createLogin();
    const otherSessionId = createSession(userId);
    try {
      upsertGrant(userId, 'main', { refreshToken: 'fake-refresh-token' });

      const res = await app.request('/auth/logout', {
        method: 'POST',
        headers: { Cookie: cookie },
      });
      assert.equal(res.status, 200);

      assert.equal(realm.objectForPrimaryKey('Session', sessionId), null);
      // 別セッションが残っているためグラントは保持される
      assert.ok(getGrant(userId, 'main'));
    } finally {
      cleanupLogin(userId, sessionId);
      cleanupLogin(userId, otherSessionId);
    }
  });
});
