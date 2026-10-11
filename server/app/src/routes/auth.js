/**
 * GET /auth/{photo-sharing,people,drive} — 追加スコープ認可の開始。
 * 既存セッションに各権限を追加するため Google の OAuth 認証画面へ
 * リダイレクトする（コールバックは共通で /enable）
 */
import { AUTH_STATE_TTL_SECONDS, ADDITIONAL_AUTH, getAuthStateKey } from '@/assets/constants.js';
import { redis } from '@/services/redis.js';
import { getOAuth2Client } from '@/services/google.js';
import { getSessionFromCookie } from '@/services/session.js';
import { parsePromptParam } from '@/services/utils.js';

/**
 * @param {AppHono} app
 */
export const registerAuthRoutes = (app) => {
  app.get('/auth/photo-sharing', startAdditionalAuth('photo-sharing'));
  app.get('/auth/people', startAdditionalAuth('people'));
  app.get('/auth/drive', startAdditionalAuth('drive'));
};

// --- ヘルパー ---

/**
 * 認可タイプごとの開始ハンドラを生成する。
 * state を発行してセッションと認可タイプに紐づけ、コールバックでの CSRF を防ぐ
 * @param {AdditionalAuthType} type
 */
const startAdditionalAuth = (type) => async (/** @type {AppContext} */ c) => {
  const session = await getSessionFromCookie(c);

  // 未ログインの場合はメインのログインフローへリダイレクト
  if (!session) {
    return c.redirect('/login');
  }

  const { prompt, error } = parsePromptParam(c.req.query('prompt'));
  if (error) {
    return c.text(error, 400);
  }

  const cfg = ADDITIONAL_AUTH[type];
  const state = crypto.randomUUID();
  await redis.set(
    getAuthStateKey(state),
    JSON.stringify({ s: session.id, t: type }),
    'EX',
    AUTH_STATE_TTL_SECONDS
  );

  const client = getOAuth2Client(cfg.redirectUri());

  const authUrl = client.generateAuthUrl({
    access_type: 'offline',
    prompt: prompt ?? 'consent',
    include_granted_scopes: true,
    scope: cfg.scopes,
    state,
  });

  return c.redirect(authUrl);
};
