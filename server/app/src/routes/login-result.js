/**
 * GET /login-result — メイン OAuth コールバック。
 * 認可コードからトークンを取得し、Realm に User/OAuthGrant/Session を
 * 保存して署名付き HttpOnly Cookie を発行する
 */
import { env, MAIN_SCOPES } from '@/assets/constants.js';
import { realm, createSession, upsertUser, upsertGrant } from '@/services/realm.js';
import { getOAuth2Client, getGoogleUserId } from '@/services/google.js';
import { getSessionFromCookie, setSessionCookie } from '@/services/session.js';
import { errMessage } from '@/services/utils.js';

/**
 * @param {AppHono} app
 */
export const registerLoginResultRoutes = (app) => {
  app.get('/login-result', async (c) => {
    const unauthorized = () =>
      c.redirect(`${env.VITE_CLIENT_APP_BASE_URL}/unauthorized`);

    const code = c.req.query('code');
    if (!code) {
      return unauthorized();
    }

    const client = getOAuth2Client();
    let tokens;
    try {
      ({ tokens } = await client.getToken(code));
    } catch (err) {
      console.error('Failed to exchange authorization code:', errMessage(err));
      return unauthorized();
    }

    /** @type {string | null | undefined} */
    let userId;
    try {
      client.setCredentials(tokens);
      userId = await getGoogleUserId(client, tokens);
    } catch (err) {
      console.error('Failed to fetch Google user info:', errMessage(err));
    }
    if (!userId) {
      return unauthorized();
    }

    upsertUser(userId);
    upsertGrant(userId, 'main', {
      scopes: tokens.scope ? tokens.scope.split(' ') : MAIN_SCOPES,
      accessToken: tokens.access_token ?? null,
      refreshToken: tokens.refresh_token ?? null,
      expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
    });

    // 再ログイン時は古いセッションを破棄してから新規発行する
    const previous = await getSessionFromCookie(c);
    if (previous) {
      try {
        realm.write(() => realm.delete(previous));
      } catch {
        // 既に削除済みなら無視
      }
    }
    const sessionId = createSession(userId);

    await setSessionCookie(c, sessionId);

    return c.redirect(`${env.VITE_CLIENT_APP_BASE_URL}/authorized`);
  });
};
