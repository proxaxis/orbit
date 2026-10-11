/**
 * 署名付きセッション Cookie と Realm セッションの橋渡し
 */
import { getSignedCookie, setSignedCookie } from 'hono/cookie';
import { SESSION_SECRET, SESSION_COOKIE_OPTIONS } from '@/assets/constants.js';
import { getSession } from '@/services/realm.js';

/**
 * Cookie 内の署名付きセッション ID を検証して返す（署名不正・未設定なら false）
 * @param {AppContext} c
 * @returns {Promise<string | false>}
 */
export const getSessionIdFromCookie = async (c) =>
  (await getSignedCookie(c, SESSION_SECRET, 'session_id')) ?? false;

/**
 * Cookie から有効な Realm セッションを解決する
 * @param {AppContext} c
 * @returns {Promise<RealmSession | null>}
 */
export const getSessionFromCookie = async (c) => {
  const sessionId = await getSessionIdFromCookie(c);
  return sessionId ? getSession(sessionId) : null;
};

/**
 * 署名付き HttpOnly Cookie をブラウザに付与する
 * @param {AppContext} c
 * @param {string} sessionId
 * @returns {Promise<void>}
 */
export const setSessionCookie = async (c, sessionId) => {
  await setSignedCookie(c, 'session_id', sessionId, SESSION_SECRET, SESSION_COOKIE_OPTIONS);
};
