/**
 * GET /api/push/vapid-key — Push 購読に使う VAPID 公開鍵を返す
 *   （公開情報のため認証不要。秘密鍵はサーバのみで保持）
 * POST /api/push/subscriptions — Push 購読の登録と通知スケジュールの
 *   登録/置き換え。endpoint ごとに購読を upsert し、送信予定は
 *   POST のたび全置き換え（空配列で全解除）
 */
import {
  PUSH_DUE_KEY,
  SESSION_TTL_SECONDS,
  getEndpointHash,
  getPushScheduleKey,
  getPushSubscriptionKey,
  getPushSubscriptionsIndexKey,
} from '@/assets/constants.js';
import { redis } from '@/services/redis.js';
import { vapidKeys, schedulePushDrain } from '@/services/push.js';
import { getSessionFromCookie } from '@/services/session.js';

/**
 * @param {AppHono} app
 */
export const registerPushRoutes = (app) => {
  app.get('/api/push/vapid-key', (c) => {
    return c.json({ publicKey: vapidKeys.publicKey });
  });

  app.post('/api/push/subscriptions', async (c) => {
    const session = await getSessionFromCookie(c);
    if (!session) {
      return c.json({ error: 'UNAUTHORIZED' }, 401);
    }
    const sessionId = session.id;

    const body = await c.req.json().catch(() => null);
    const subscription = body?.subscription;
    const notifications = body?.notifications;

    const validSubscription =
      typeof subscription?.endpoint === 'string' &&
      subscription.endpoint.startsWith('https://') &&
      typeof subscription?.keys?.p256dh === 'string' &&
      typeof subscription?.keys?.auth === 'string';
    const validNotifications =
      Array.isArray(notifications) &&
      notifications.every(
        (/** @type {any} */ n) =>
          typeof n?.key === 'string' &&
          n.key.length > 0 &&
          typeof n?.fireAt === 'number' &&
          Number.isFinite(n.fireAt) &&
          typeof n?.notification?.title === 'string'
      );

    if (!validSubscription || !validNotifications) {
      return c.json({ error: 'INVALID_REQUEST' }, 400);
    }

    const endpointHash = getEndpointHash(subscription.endpoint);

    // ログインユーザー（セッション）に紐付けて購読を保存。セッションと同じ TTL で失効させる
    await redis.set(
      getPushSubscriptionKey(endpointHash),
      JSON.stringify({
        endpoint: subscription.endpoint,
        keys: subscription.keys,
        sessionId,
      }),
      'EX',
      SESSION_TTL_SECONDS
    );
    await redis.sadd(getPushSubscriptionsIndexKey(sessionId), endpointHash);
    await redis.expire(getPushSubscriptionsIndexKey(sessionId), SESSION_TTL_SECONDS);

    // この endpoint の既存スケジュールを全て破棄してから登録し直す
    const scheduleKey = getPushScheduleKey(endpointHash);
    const oldMembers = await redis.hvals(scheduleKey);
    if (oldMembers.length) {
      await redis.zrem(PUSH_DUE_KEY, oldMembers);
    }
    await redis.del(scheduleKey);

    for (const n of notifications) {
      const member = JSON.stringify({
        h: endpointHash,
        k: n.key,
        n: n.notification,
      });
      await redis.hset(scheduleKey, n.key, member);
      await redis.zadd(PUSH_DUE_KEY, n.fireAt, member);
    }
    if (notifications.length) {
      await redis.expire(scheduleKey, SESSION_TTL_SECONDS);
    }

    // 既に fireAt を過ぎた分や直近の通知を即時に処理する
    schedulePushDrain(0);

    return c.json({ ok: true });
  });
};
