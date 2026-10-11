/**
 * GET /enable — 追加スコープ認可のコールバック。
 * state に保持した認可タイプで判別してトークンを交換し、
 * OAuthGrant をセッションのユーザに紐づけて upsert する
 */
import {
  env,
  ADDITIONAL_AUTH,
  ADDITIONAL_AUTH_TYPES,
  getAuthStateKey,
} from '@/assets/constants.js';
import { redis } from '@/services/redis.js';
import { getSession, upsertGrant } from '@/services/realm.js';
import { getOAuth2Client } from '@/services/google.js';
import { errMessage } from '@/services/utils.js';

/**
 * @param {AppHono} app
 */
export const registerEnableRoutes = (app) => {
  app.get('/enable', async (c) => {
    const code = c.req.query('code');
    const state = c.req.query('state');

    // state から認可フローを開始したセッションとタイプを復元（ワンタイム利用）
    const stateKey = state ? getAuthStateKey(state) : null;
    const stateRaw = stateKey ? await redis.get(stateKey) : null;
    if (stateRaw && stateKey) {
      await redis.del(stateKey);
    }

    /** @type {string | undefined} */
    let sessionId;
    /** @type {string | undefined} */
    let type;
    if (stateRaw) {
      try {
        const parsed = JSON.parse(stateRaw);
        sessionId = parsed?.s;
        type = parsed?.t;
      } catch {
        sessionId = stateRaw; // 旧形式（セッションIDのみ）はクエリの t に委ねる
      }
    }
    type ??= c.req.query('t');

    if (!ADDITIONAL_AUTH_TYPES.has(type ?? '')) {
      return c.text('Unsupported enable type', 400);
    }
    const grantType = /** @type {AdditionalAuthType} */ (type);

    const redirectTo = (/** @type {string} */ path) =>
      c.redirect(`${env.VITE_CLIENT_APP_BASE_URL}/${path}?t=${grantType}`);

    // code / state がない場合（ユーザーが同意を拒否した場合等）もフロントへ戻す
    const session = sessionId ? getSession(sessionId) : null;
    if (!code || !stateRaw || !session) {
      if (!code || !session) {
        console.warn('Additional auth callback without code, state, or valid session');
      }
      return redirectTo('unauthorized');
    }

    try {
      const cfg = ADDITIONAL_AUTH[grantType];
      const client = getOAuth2Client(cfg.redirectUri());
      const { tokens } = await client.getToken(code);

      upsertGrant(session.userId, grantType, {
        scopes: tokens.scope ? tokens.scope.split(' ') : cfg.scopes,
        accessToken: tokens.access_token ?? null,
        refreshToken: tokens.refresh_token ?? null,
        expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      });
    } catch (err) {
      console.error(`Failed to exchange ${grantType} authorization code:`, errMessage(err));
      return redirectTo('unauthorized');
    }

    return redirectTo('authorized');
  });
};
