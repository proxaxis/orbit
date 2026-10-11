/**
 * GET /api/token — 有効な Google Access Token を取得および更新する。
 * ?t=photo-sharing / ?t=people / ?t=drive の場合は追加スコープで
 * 認可済みのグラントを使う（無指定はメイン）
 */
import { ADDITIONAL_AUTH_TYPES } from '@/assets/constants.js';
import { getGrant, deleteGrant } from '@/services/realm.js';
import { getValidAccessToken, isInvalidGrantError } from '@/services/google.js';
import { getSessionFromCookie } from '@/services/session.js';
import { errMessage } from '@/services/utils.js';

/**
 * @param {AppHono} app
 */
export const registerApiTokenRoutes = (app) => {
  app.get('/api/token', async (c) => {
    const t = c.req.query('t');
    const type = t || 'main';

    if (t && !ADDITIONAL_AUTH_TYPES.has(t)) {
      return c.json({ error: 'UNSUPPORTED_TOKEN_TYPE' }, 400);
    }

    const session = await getSessionFromCookie(c);
    if (!session) {
      return c.json({ error: 'UNAUTHORIZED' }, 401);
    }

    const notAuthorized = () =>
      type === 'main'
        ? c.json({ error: 'UNAUTHORIZED' }, 401)
        : c.json({ error: `${type.toUpperCase().replace(/-/g, '_')}_NOT_AUTHORIZED` }, 404);

    const grant = getGrant(session.userId, type);
    if (!grant) {
      return notAuthorized();
    }

    try {
      const token = await getValidAccessToken(grant);
      if (!token) {
        return notAuthorized();
      }
      return c.json({ gAccessToken: token });
    } catch (err) {
      // GaxiosError は config.data にリフレッシュトークンを含むため、
      // エラーオブジェクト全体はログに出さずメッセージとレスポンスボディだけ残す
      const oauthError = /** @type {any} */ (err)?.response?.data;
      console.error('Failed to refresh access token:', errMessage(err), oauthError);

      // invalid_grant はトークン失効/revoke 済みなので、グラントを破棄して再認可を促す
      if (isInvalidGrantError(err)) {
        deleteGrant(grant);
        return notAuthorized();
      }

      return c.json({ error: 'TOKEN_REFRESH_FAILED' }, 401);
    }
  });
};
