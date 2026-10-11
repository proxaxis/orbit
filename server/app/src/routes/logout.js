/**
 * POST /logout — Realm のセッションと Cookie を破棄し、Push 購読も解除する。
 * ユーザーの他に有効なセッションが残っていなければ、保持している
 * リフレッシュトークンは Google 側でも revoke してグラントを削除する
 * （revoke に失敗してもログアウト自体は成功とする）
 */
import { deleteCookie } from 'hono/cookie';
import { getPushSubscriptionsIndexKey } from '@/assets/constants.js';
import { redis } from '@/services/redis.js';
import { realm } from '@/services/realm.js';
import { removePushSubscription } from '@/services/push.js';
import { getSessionIdFromCookie } from '@/services/session.js';
import { errMessage } from '@/services/utils.js';

/**
 * @param {AppHono} app
 */
export const registerLogoutRoutes = (app) => {
  app.post('/logout', async (c) => {
    const sessionId = await getSessionIdFromCookie(c);

    if (sessionId) {
      const session = /** @type {RealmSession | null} */ (
        realm.objectForPrimaryKey('Session', sessionId)
      );
      const userId = /** @type {string | undefined} */ (session?.userId);
      if (session) {
        try {
          realm.write(() => realm.delete(session));
        } catch {
          // 既に削除済みなら無視
        }
      }

      // ログアウトした端末の Push 購読と送信予定も解除する
      const endpointHashes = await redis.smembers(getPushSubscriptionsIndexKey(sessionId));
      await redis.del(getPushSubscriptionsIndexKey(sessionId));
      for (const endpointHash of endpointHashes) {
        await removePushSubscription(endpointHash);
      }

      // 最後のセッションを閉じた場合はグラントごと破棄する
      if (userId && realm.objects('Session').filtered('userId == $0', userId).length === 0) {
        const grants = /** @type {RealmOAuthGrant[]} */ (/** @type {unknown} */ ([
          ...realm.objects('OAuthGrant').filtered('userId == $0', userId),
        ]));
        const tokens = grants.map((g) => g.refreshToken).filter(Boolean);
        if (grants.length) {
          realm.write(() => {
            for (const grant of grants) {
              realm.delete(grant);
            }
          });
        }
        for (const token of tokens) {
          try {
            const res = await fetch(
              `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(/** @type {string} */ (token))}`,
              { method: 'POST', signal: AbortSignal.timeout(5000) }
            );
            if (!res.ok) {
              console.warn(`Token revocation returned status ${res.status}`);
            }
          } catch (err) {
            console.warn('Failed to revoke Google token:', errMessage(err));
          }
        }
      }
    }
    deleteCookie(c, 'session_id', {
      path: '/',
      secure: true,
      sameSite: 'None',
    });

    return c.json({ ok: true });
  });
};
