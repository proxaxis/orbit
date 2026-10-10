import { createHash } from 'node:crypto';
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
process.env.REALM_PATH = '/tmp/orbit-bff-push-test.realm';

const {
  app,
  redis,
  realm,
  SESSION_SECRET,
  drainDuePushNotifications,
  createSession: createRealmSession,
  upsertUser,
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

const endpointHash = (/** @type {string} */ endpoint) =>
  createHash('sha256').update(endpoint).digest('hex');

const makeSubscription = () => ({
  endpoint: `https://push.example.test/sub/${crypto.randomUUID()}`,
  keys: { p256dh: 'x'.repeat(88), auth: 'y'.repeat(24) },
});

const makeNotification = (/** @type {string} */ key, /** @type {number} */ fireAt) => ({
  key,
  fireAt,
  notification: {
    title: `Event ${key}`,
    options: {
      body: 'starts soon',
      tag: `orbit-event-${key}`,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { eid: 'e1', cid: 'c1', key, url: '/' },
    },
  },
});

// テスト用のユーザ＋ログイン済みセッションを Realm に作り、Cookie ヘッダ値を返す
const createSession = async () => {
  const userId = `test-user-${crypto.randomUUID()}`;
  upsertUser(userId);
  const sessionId = createRealmSession(userId);
  const signature = await signCookie(sessionId, SESSION_SECRET);
  const cookie = `session_id=${encodeURIComponent(`${sessionId}.${signature}`)}`;
  return { userId, sessionId, cookie };
};

const cleanup = async (
  /** @type {string} */ userId,
  /** @type {string} */ sessionId,
  /** @type {string | undefined} */ endpoint = undefined
) => {
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
  const keys = [`push:subscriptions:${sessionId}`];
  if (endpoint) {
    const h = endpointHash(endpoint);
    const members = await redis.hvals(`push:schedule:${h}`);
    if (members.length) {
      await redis.zrem('push:due', members);
    }
    keys.push(`push:schedule:${h}`, `push:subscription:${h}`);
  }
  await redis.del(keys);
};

const postSubscriptions = (/** @type {string} */ cookie, /** @type {unknown} */ body) =>
  app.request('/api/push/subscriptions', {
    method: 'POST',
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('GET /api/push/vapid-key', () => {
  it('returns a base64url-encoded P-256 public key', async () => {
    const res = await app.request('/api/push/vapid-key');
    assert.equal(res.status, 200);
    const { publicKey } = await res.json();
    // 非圧縮 P-256 公開鍵は 65 バイト → base64url で 87 文字（パディングなし）
    assert.match(publicKey, /^[A-Za-z0-9_-]{87}$/);
  });
});

describe('POST /api/push/subscriptions', () => {
  it('returns 401 without a session cookie', async () => {
    const res = await postSubscriptions('', {
      subscription: makeSubscription(),
      notifications: [],
    });
    assert.equal(res.status, 401);
  });

  it('returns 400 for a malformed body', async (t) => {
    if (!redisAvailable) {
      t.skip('Redis is not reachable');
      return;
    }
    const { userId, sessionId, cookie } = await createSession();
    try {
      // notifications が配列でない
      let res = await postSubscriptions(cookie, {
        subscription: makeSubscription(),
      });
      assert.equal(res.status, 400);

      // subscription.keys が不足
      res = await postSubscriptions(cookie, {
        subscription: { endpoint: 'https://push.example.test/x' },
        notifications: [],
      });
      assert.equal(res.status, 400);

      // notification.title がないエントリを含む
      res = await postSubscriptions(cookie, {
        subscription: makeSubscription(),
        notifications: [{ key: 'k', fireAt: 1, notification: {} }],
      });
      assert.equal(res.status, 400);
    } finally {
      await cleanup(userId, sessionId);
    }
  });

  it('stores the subscription and schedules notifications', async (t) => {
    if (!redisAvailable) {
      t.skip('Redis is not reachable');
      return;
    }
    const { userId, sessionId, cookie } = await createSession();
    const subscription = makeSubscription();
    const fireAt = Date.now() + 60 * 60 * 1000;
    try {
      const res = await postSubscriptions(cookie, {
        subscription,
        notifications: [makeNotification('a', fireAt)],
      });
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { ok: true });

      const h = endpointHash(subscription.endpoint);
      const stored = JSON.parse(
        /** @type {string} */ (await redis.get(`push:subscription:${h}`))
      );
      assert.equal(stored.endpoint, subscription.endpoint);
      assert.equal(stored.sessionId, sessionId);
      assert.equal(await redis.sismember(`push:subscriptions:${sessionId}`, h), 1);

      const member = await redis.hget(`push:schedule:${h}`, 'a');
      assert.ok(member != null);
      assert.equal(await redis.zscore('push:due', /** @type {string} */ (member)), String(fireAt));
    } finally {
      await cleanup(userId, sessionId, subscription.endpoint);
    }
  });

  it('replaces the schedule on re-post and clears it with an empty array', async (t) => {
    if (!redisAvailable) {
      t.skip('Redis is not reachable');
      return;
    }
    const { userId, sessionId, cookie } = await createSession();
    const subscription = makeSubscription();
    const h = endpointHash(subscription.endpoint);
    try {
      await postSubscriptions(cookie, {
        subscription,
        notifications: [
          makeNotification('old-1', Date.now() + 3600_000),
          makeNotification('old-2', Date.now() + 7200_000),
        ],
      });

      // 別の通知セットで再 POST → 旧スケジュールは破棄される
      await postSubscriptions(cookie, {
        subscription,
        notifications: [makeNotification('new-1', Date.now() + 3600_000)],
      });
      assert.equal(await redis.hlen(`push:schedule:${h}`), 1);
      assert.ok(await redis.hget(`push:schedule:${h}`, 'new-1'));
      const members = await redis.zrangebyscore('push:due', 0, '+inf');
      const ours = members.filter((m) => m.includes(`"h":"${h}"`));
      assert.equal(ours.length, 1);

      // 空配列で全解除（購読自体は残る）
      await postSubscriptions(cookie, { subscription, notifications: [] });
      assert.equal(await redis.hlen(`push:schedule:${h}`), 0);
      assert.ok(await redis.get(`push:subscription:${h}`));
    } finally {
      await cleanup(userId, sessionId, subscription.endpoint);
    }
  });

  it('discards due notifications whose subscription is gone', async (t) => {
    if (!redisAvailable) {
      t.skip('Redis is not reachable');
      return;
    }
    const orphan = JSON.stringify({
      h: 'nonexistent-endpoint-hash',
      k: 'gone',
      n: { title: 't' },
    });
    const before = await redis.zcard('push:due');
    await redis.zadd('push:due', Date.now() - 1000, orphan);
    try {
      await drainDuePushNotifications();
      assert.equal(await redis.zcard('push:due'), before);
    } finally {
      await redis.zrem('push:due', orphan);
    }
  });

  it('removes push subscriptions on logout', async (t) => {
    if (!redisAvailable) {
      t.skip('Redis is not reachable');
      return;
    }
    const { userId, sessionId, cookie } = await createSession();
    const subscription = makeSubscription();
    const h = endpointHash(subscription.endpoint);
    try {
      await postSubscriptions(cookie, {
        subscription,
        notifications: [makeNotification('a', Date.now() + 3600_000)],
      });
      assert.ok(await redis.get(`push:subscription:${h}`));

      const res = await app.request('/auth/logout', {
        method: 'POST',
        headers: { Cookie: cookie },
      });
      assert.equal(res.status, 200);

      assert.equal(await redis.get(`push:subscription:${h}`), null);
      assert.equal(await redis.exists(`push:schedule:${h}`), 0);
      assert.equal(await redis.exists(`push:subscriptions:${sessionId}`), 0);
    } finally {
      await cleanup(userId, sessionId, subscription.endpoint);
    }
  });
});
