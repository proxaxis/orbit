/**
 * Web Push（VAPID）の初期化・購読管理・送信スケジューラ
 */
import webpush from 'web-push';
import {
  env,
  PUSH_DUE_KEY,
  PUSH_DRAIN_BATCH,
  PUSH_SCHEDULER_MAX_DELAY_MS,
  PUSH_TTL_SECONDS,
  getPushScheduleKey,
  getPushSubscriptionKey,
  getPushSubscriptionsIndexKey,
} from '@/assets/constants.js';
import { redis } from '@/services/redis.js';
import { errMessage } from '@/services/utils.js';

// 秘密鍵はサーバのみで保持する。環境変数が未設定の場合は起動ごとに生成するが、
// applicationServerKey が変わると既存購読への送信が拒否されるため、
// 本番では VITE_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY を固定して設定すること
export const vapidKeys =
  env.VITE_VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY
    ? {
        publicKey: env.VITE_VAPID_PUBLIC_KEY,
        privateKey: env.VAPID_PRIVATE_KEY,
      }
    : webpush.generateVAPIDKeys();
if (!env.VITE_VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
  console.warn(
    'VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY are not set; using ephemeral VAPID keys. ' +
      'Existing push subscriptions will break on restart.'
  );
}
webpush.setVapidDetails(
  env.VAPID_SUBJECT ?? 'mailto:webpush@localhost',
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

/**
 * 購読・スケジュール・セッション索引をまとめて削除する
 * @param {string} endpointHash
 * @returns {Promise<void>}
 */
export const removePushSubscription = async (endpointHash) => {
  const raw = await redis.get(getPushSubscriptionKey(endpointHash));
  const members = await redis.hvals(getPushScheduleKey(endpointHash));

  const pipeline = redis.pipeline();
  if (members.length) {
    pipeline.zrem(PUSH_DUE_KEY, members);
  }
  pipeline.del(getPushScheduleKey(endpointHash), getPushSubscriptionKey(endpointHash));

  if (raw) {
    try {
      const { sessionId } = JSON.parse(raw);
      if (sessionId) {
        pipeline.srem(getPushSubscriptionsIndexKey(sessionId), endpointHash);
      }
    } catch {
      // 壊れたデータは索引の掃除だけスキップして削除を続行
    }
  }
  await pipeline.exec();
};

// fireAt を過ぎた通知を取り出して Push 送信する。
// ZREM で先に請求するため複数インスタンスがいても二重送信しない
export const drainDuePushNotifications = async () => {
  const members = await redis.zrangebyscore(
    PUSH_DUE_KEY,
    0,
    Date.now(),
    'LIMIT',
    0,
    PUSH_DRAIN_BATCH
  );

  for (const member of members) {
    if ((await redis.zrem(PUSH_DUE_KEY, member)) !== 1) {
      continue;
    }

    let item;
    try {
      item = JSON.parse(member);
    } catch {
      continue;
    }
    const { h: endpointHash, k: key, n: notification } = item ?? {};
    if (!endpointHash || !key || !notification) {
      continue;
    }

    // 送信成否にかかわらず送信済みとして破棄する
    await redis.hdel(getPushScheduleKey(endpointHash), key);
    const raw = await redis.get(getPushSubscriptionKey(endpointHash));
    if (!raw) {
      continue;
    }

    let subscription;
    try {
      subscription = JSON.parse(raw);
    } catch {
      continue;
    }

    try {
      await webpush.sendNotification(
        { endpoint: subscription.endpoint, keys: subscription.keys },
        JSON.stringify({ key, notification }),
        { TTL: PUSH_TTL_SECONDS }
      );
    } catch (err) {
      const status = /** @type {any} */ (err)?.statusCode;
      if (status === 404 || status === 410) {
        // 失効した購読は以後の送信予定ごと削除する
        await removePushSubscription(endpointHash);
      } else {
        console.error(
          'Failed to send push notification:',
          errMessage(err),
          status
        );
      }
    }
  }
};

// 次の due 時刻までスリープする自己再スケジュール型タイマー。
// 新しい通知が追加されたときは schedulePushDrain(0) で即座に起こす
/** @type {ReturnType<typeof setTimeout> | null} */
let pushTimer = null;
/**
 * @param {number} delayMs
 */
export const schedulePushDrain = (delayMs) => {
  if (pushTimer) {
    clearTimeout(pushTimer);
  }
  pushTimer = setTimeout(async () => {
    try {
      await drainDuePushNotifications();
      const next = await redis.zrange(PUSH_DUE_KEY, '0', '0', 'WITHSCORES');
      const nextDelay =
        next.length >= 2
          ? Math.min(Math.max(Number(next[1]) - Date.now(), 0), PUSH_SCHEDULER_MAX_DELAY_MS)
          : PUSH_SCHEDULER_MAX_DELAY_MS;
      schedulePushDrain(nextDelay);
    } catch (err) {
      console.error('Push scheduler error:', err);
      schedulePushDrain(PUSH_SCHEDULER_MAX_DELAY_MS);
    }
  }, delayMs);
  pushTimer.unref?.();
};
