/**
 * Realm 永続化（User / OAuthGrant / Session / ApiRequest / ApiRequestLog）
 * と、その基本 CRUD ヘルパー
 */
import Realm from 'realm';
import {
  env,
  REALM_SCHEMA,
  REALM_SCHEMA_VERSION,
  SESSION_TTL_SECONDS,
} from '@/assets/constants.js';

/** @type {Realm} */
export const realm = await Realm.open({
  path: env.REALM_PATH, // 未指定なら Realm のデフォルトパス（cwd の default.realm）
  schemaVersion: REALM_SCHEMA_VERSION,
  // onMigration と deleteRealmIfMigrationNeeded は併用不可。
  // 開発時はスキーマ不一致で作り直し、本番は追加型変更を空マイグレーションで吸収する
  ...(env.NODE_ENV === 'production'
    ? { onMigration: () => {} }
    : { deleteRealmIfMigrationNeeded: true }),
  schema: REALM_SCHEMA,
});

/**
 * 期限切れセッションは遅延削除する。有効な Realm Session オブジェクトを返す
 * @param {string | false | undefined} sessionId
 * @returns {RealmSession | null}
 */
export const getSession = (sessionId) => {
  if (!sessionId) return null;
  const session = /** @type {RealmSession | null} */ (
    realm.objectForPrimaryKey('Session', sessionId)
  );
  if (!session) return null;
  if (session.expiresAt.getTime() <= Date.now()) {
    try {
      realm.write(() => realm.delete(session));
    } catch {
      // 既に削除済みなら無視
    }
    return null;
  }
  return session;
};

/**
 * セッションを発行して ID を返す
 * @param {string} userId
 * @returns {string}
 */
export const createSession = (userId) => {
  const now = Date.now();
  const id = crypto.randomUUID();
  realm.write(() => {
    realm.create('Session', {
      id,
      userId,
      createdAt: new Date(now),
      expiresAt: new Date(now + SESSION_TTL_SECONDS * 1000),
    });
  });
  return id;
};

/**
 * @param {string} userId
 */
export const upsertUser = (userId) => {
  realm.write(() => {
    const existing = realm.objectForPrimaryKey('User', userId);
    realm.create(
      'User',
      {
        id: userId,
        createdAt: existing?.createdAt ?? new Date(),
        updatedAt: new Date(),
      },
      Realm.UpdateMode.Modified
    );
  });
};

/**
 * グラントを upsert。新しい値が無い項目（特に refreshToken）は既存値を温存する
 * @param {string} userId
 * @param {GrantType | string} type
 * @param {OAuthGrantData} data
 * @returns {RealmOAuthGrant | null}
 */
export const upsertGrant = (userId, type, data) => {
  const id = `${userId}/${type}`;
  realm.write(() => {
    const existing = /** @type {RealmOAuthGrant | null} */ (
      realm.objectForPrimaryKey('OAuthGrant', id)
    );
    realm.create(
      'OAuthGrant',
      {
        id,
        userId,
        type,
        scopes: data.scopes ?? (existing ? [...existing.scopes] : []),
        accessToken: data.accessToken ?? existing?.accessToken ?? null,
        refreshToken: data.refreshToken ?? existing?.refreshToken ?? null,
        expiresAt: data.expiresAt ?? existing?.expiresAt ?? null,
        updatedAt: new Date(),
      },
      Realm.UpdateMode.Modified
    );
  });
  return /** @type {RealmOAuthGrant | null} */ (realm.objectForPrimaryKey('OAuthGrant', id));
};

/**
 * @param {string} userId
 * @param {GrantType | string} type
 * @returns {RealmOAuthGrant | null}
 */
export const getGrant = (userId, type) =>
  /** @type {RealmOAuthGrant | null} */ (
    realm.objectForPrimaryKey('OAuthGrant', `${userId}/${type}`)
  );

/**
 * @param {RealmOAuthGrant} grant
 */
export const deleteGrant = (grant) => {
  try {
    realm.write(() => realm.delete(grant));
  } catch {
    // 既に削除済みなら無視
  }
};
