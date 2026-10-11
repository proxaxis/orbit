/**
 * Google OAuth2 クライアントとアクセストークン管理
 */
import { google } from 'googleapis';
import { env, ACCESS_TOKEN_REFRESH_MARGIN_MS } from '@/assets/constants.js';
import { realm } from '@/services/realm.js';

/**
 * Google OAuth2 クライアント初期化
 * @param {string} [redirectUri]
 * @returns {GoogleOAuth2Client}
 */
export const getOAuth2Client = (redirectUri = env.GOOGLE_REDIRECT_URI_AUTH) =>
  new google.auth.OAuth2(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, redirectUri);

/**
 * 認可済みトークンから Google アカウント ID (sub) を取得する。
 * id_token があればそれをデコードし、無ければ userinfo エンドポイントを叩く
 * @param {GoogleOAuth2Client} client
 * @param {GoogleCredentials} tokens
 * @returns {Promise<string | null>}
 */
export const getGoogleUserId = async (client, tokens) => {
  if (tokens.id_token) {
    try {
      const payload = JSON.parse(
        Buffer.from(tokens.id_token.split('.')[1], 'base64url').toString('utf8')
      );
      if (typeof payload?.sub === 'string' && payload.sub) {
        return payload.sub;
      }
    } catch {
      // デコード失敗時は userinfo にフォールバック
    }
  }
  const { data } = await google
    .oauth2({ version: 'v2', auth: client })
    .userinfo.get();
  return data.id ?? null;
};

/**
 * @param {RealmOAuthGrant | null | undefined} grant
 */
export const isAccessTokenValid = (grant) =>
  !!grant?.accessToken &&
  !!grant?.expiresAt &&
  grant.expiresAt.getTime() > Date.now() + ACCESS_TOKEN_REFRESH_MARGIN_MS;

/**
 * refreshAccessToken で更新して REALM を書き戻す。invalid_grant は呼び出し側で処理する
 * @param {RealmOAuthGrant} grant
 * @returns {Promise<string | null>}
 */
export const refreshGrantToken = async (grant) => {
  const client = getOAuth2Client();
  client.setCredentials({ refresh_token: grant.refreshToken });
  const { credentials } = await client.refreshAccessToken();
  realm.write(() => {
    grant.accessToken = credentials.access_token ?? grant.accessToken;
    if (credentials.refresh_token) {
      grant.refreshToken = credentials.refresh_token;
    }
    if (credentials.expiry_date) {
      grant.expiresAt = new Date(credentials.expiry_date);
    }
    grant.updatedAt = new Date();
  });
  return grant.accessToken;
};

/**
 * REALM 上のグラントから有効なアクセストークンを返す。期限切れならリフレッシュする
 * @param {RealmOAuthGrant} grant
 * @param {{ forceRefresh?: boolean }} [opts]
 * @returns {Promise<string | null>}
 */
export const getValidAccessToken = async (grant, opts = {}) => {
  if (!opts.forceRefresh && isAccessTokenValid(grant)) {
    return grant.accessToken;
  }
  if (grant.refreshToken) {
    return refreshGrantToken(grant);
  }
  // リフレッシュ不能なら残っているトークンを最後まで使う（無ければ null）
  return opts.forceRefresh ? null : (grant.accessToken ?? null);
};

/**
 * @param {any} err
 * @returns {boolean}
 */
export const isInvalidGrantError = (err) =>
  err?.response?.data?.error === 'invalid_grant';
