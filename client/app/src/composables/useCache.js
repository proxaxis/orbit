/**
 * アプリのキャッシュ・オフライン永続化の窓口。
 * IndexedDB への読み書き、Cache Storage の削除、Service Worker への
 * バックグラウンド同期要求をここに集約する。
 * Vue / Pinia に依存しない純粋関数のみで構成し、Service Worker（src/sw.js）の
 * バンドルからもそのまま参照できるようにしている。
 */

/** @type {string} キャッシュ保存に使う IndexedDB データベース名 */
export const CACHE_DATABASE_NAME = 'orbit-offline';
/** @type {number} IndexedDB のスキーマバージョン */
const CACHE_DATABASE_VERSION = 1;
/** @type {string} キー・バリュー型のオブジェクトストア名 */
const CACHE_STORE_NAME = 'settings';

/**
 * アプリ内で利用するキャッシュキーの一覧。
 * @readonly
 * @enum {string}
 */
export const CACHE_KEYS = Object.freeze({
  /** 個人設定の保存キー */
  USER_SETTINGS: 'orbit-user-settings',
  /** イベント一覧（オフライン用）の保存キー */
  EVENTS: 'events',
  /** カレンダー一覧（オフライン用）の保存キー */
  CALENDARS: 'calendars',
  /** セッションカレンダーの保存キー */
  SESSION_CALENDARS: 'session-calendars',
  /** オフライン中に保留されたイベント操作キューの保存キー */
  EVENT_OPERATIONS: 'event-operations',
  /** 範囲指定共有条件の保存キー */
  SHARE_SPECS: 'share-specs',
  /** 通知済みイベントキーの保存キー */
  NOTIFIED_EVENTS: 'notified-events',
  /** Service Worker が参照する今後の通知スケジュールの保存キー */
  NOTIFICATION_SCHEDULE: 'notification-schedule',
  /** 最近使ったイベントタイトルの保存キー */
  RECENT_EVENT_TITLES: 'recent-event-titles',
  /** 最近使ったイベントタグの保存キー */
  RECENT_EVENT_TAGS: 'recent-event-tags',
  /** 絵文字の履歴の保存キー */
  EMOJI_HISTORY: 'emoji-history',
  /** 絵文字のカテゴリ上書きの保存キー */
  EMOJI_CATEGORY_OVERRIDES: 'emoji-category-overrides',
  /** Service Worker のバックグラウンド同期が利用するアクセストークンの保存キー */
  ACCESS_TOKEN: 'orbit-access-token',
  /** イベントテンプレート一覧の保存キー */
  EVENT_TEMPLATES: 'event-templates',
  /** 前回ログインしていたアカウント（プライマリカレンダー ID）の保存キー */
  ACCOUNT_ID: 'orbit-account-id',
  /** リモート変更チェックを最後に実行した時刻（updatedMin 差分クエリの起点）の保存キー */
  REMOTE_SYNC_CHECKED_AT: 'orbit-remote-sync-checked-at',
  /** Drive へ最後に書き込んだ/適用した同期データの updatedAt の保存キー */
  DRIVE_SYNC_AT: 'orbit-drive-sync-at',
});

/**
 * Service Worker の Background Sync / Periodic Background Sync で使うタグの一覧。
 * @readonly
 * @enum {string}
 */
export const SYNC_TAGS = Object.freeze({
  /** 通知のバックグラウンド配信 */
  NOTIFICATIONS: 'orbit-notifications',
  /** オフラインキューの再送 */
  OFFLINE_QUEUE: 'orbit-offline-queue',
  /** 共有カレンダーのバックグラウンド同期 */
  SHARE_SYNC: 'orbit-share-sync',
});

/**
 * キャッシュ用 IndexedDB を開く。未対応環境では null を返す。
 * @returns {Promise<IDBDatabase|null>}
 */
function openDatabase() {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(CACHE_DATABASE_NAME, CACHE_DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(CACHE_STORE_NAME)) request.result.createObjectStore(CACHE_STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB.'));
  });
}

/**
 * キャッシュから値を読み込む
 * @param {string} key キャッシュキー
 * @param {any} fallback 未保存・失敗時に返す値
 * @returns {Promise<any>}
 */
export async function readCache(key, fallback) {
  try {
    const database = await openDatabase();
    if (!database) return fallback;
    return await new Promise((resolve, reject) => {
      const request = database.transaction(CACHE_STORE_NAME, 'readonly').objectStore(CACHE_STORE_NAME).get(key);
      request.onsuccess = () => {
        database.close();
        resolve(request.result ?? fallback);
      };
      request.onerror = () => {
        database.close();
        reject(request.error ?? new Error('Failed to read IndexedDB data.'));
      };
    });
  } catch (error) {
    console.warn(`Failed to read cache: ${key}`, error);
    return fallback;
  }
}

/**
 * キャッシュへ値を書き込む
 * @param {string} key キャッシュキー
 * @param {any} value 保存する値（JSON シリアライズ可能なもの）
 * @returns {Promise<void>}
 */
export async function writeCache(key, value) {
  try {
    const database = await openDatabase();
    if (!database) return;
    const storableValue = JSON.parse(JSON.stringify(value));
    await new Promise((resolve, reject) => {
      const request = database.transaction(CACHE_STORE_NAME, 'readwrite').objectStore(CACHE_STORE_NAME).put(storableValue, key);
      request.onsuccess = () => {
        database.close();
        resolve(undefined);
      };
      request.onerror = () => {
        database.close();
        reject(request.error ?? new Error('Failed to write IndexedDB data.'));
      };
    });
  } catch (error) {
    console.warn(`Failed to write cache: ${key}`, error);
  }
}

/**
 * キャッシュからキーを削除する
 * @param {string} key 削除するキャッシュキー
 * @returns {Promise<void>}
 */
export async function deleteCache(key) {
  const database = await openDatabase();
  if (!database) return;

  await new Promise((resolve, reject) => {
    const request = database.transaction(CACHE_STORE_NAME, 'readwrite').objectStore(CACHE_STORE_NAME).delete(key);
    request.onsuccess = () => {
      database.close();
      resolve(undefined);
    };
    request.onerror = () => {
      database.close();
      reject(request.error ?? new Error('Failed to delete IndexedDB data.'));
    };
  });
}

/**
 * 指定キーを残して IndexedDB 上のキャッシュとアプリシェルの Cache Storage を削除する
 * @param {string[]} [preservedKeys=[]] 削除せずに残すキャッシュキー
 * @returns {Promise<void>}
 */
export async function clearCache(preservedKeys = []) {
  const database = await openDatabase();
  if (database) {
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(CACHE_STORE_NAME, 'readwrite');
      const store = transaction.objectStore(CACHE_STORE_NAME);
      const request = store.openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        if (!preservedKeys.includes(cursor.key)) cursor.delete();
        cursor.continue();
      };
      transaction.oncomplete = () => {
        database.close();
        resolve(undefined);
      };
      transaction.onerror = () => {
        database.close();
        reject(transaction.error ?? new Error('Failed to clear IndexedDB cache.'));
      };
    });
  }

  if (typeof caches !== 'undefined') {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.filter((name) => name.startsWith('orbit-shell-')).map((name) => caches.delete(name)));
  }
}

/**
 * Service Worker の登録を取得する。未対応・未登録の場合は null。
 * @returns {Promise<ServiceWorkerRegistration|null>}
 */
export async function serviceWorkerRegistration() {
  try {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
    return (await navigator.serviceWorker.getRegistration?.()) ?? (await navigator.serviceWorker.ready) ?? null;
  } catch {
    return null;
  }
}

/**
 * バックグラウンド同期（Background Sync）を要求する。
 * 非対応ブラウザでは無視される。
 * @param {string} tag 同期タグ（SYNC_TAGS の値）
 * @returns {Promise<void>}
 */
export async function registerBackgroundSync(tag) {
  try {
    const registration = await serviceWorkerRegistration();
    await registration?.sync?.register(tag)?.catch(() => null);
  } catch {
    // 非対応環境ではバックグラウンド同期なし
  }
}

/**
 * Periodic Background Sync を登録する。権限が未取得なら要求も行う。
 * 非対応ブラウザでは無視される。
 * @param {string} tag 同期タグ（SYNC_TAGS の値）
 * @param {number} minInterval 最小実行間隔（ミリ秒）
 * @returns {Promise<void>}
 */
export async function registerPeriodicBackgroundSync(tag, minInterval) {
  try {
    const registration = await serviceWorkerRegistration();
    if (!registration?.periodicSync) return;
    const status = await navigator.permissions?.query?.({ name: /** @type {any} */ ('periodic-background-sync') }).catch(() => null);
    if (!status || status.state === 'granted') {
      await registration.periodicSync.register(tag, { minInterval }).catch(() => null);
    }
  } catch {
    // 非対応環境では定期バックグラウンド処理なし
  }
}

/**
 * Service Worker へメッセージを送信する
 * @param {any} message 送信するメッセージ
 * @returns {Promise<void>}
 */
export async function postToServiceWorker(message) {
  const registration = await serviceWorkerRegistration();
  registration?.active?.postMessage(message);
}

/**
 * アプリの Service Worker（dist/sw.js）を登録する。
 * 開発モードでは逆に古い Service Worker とキャッシュを除去して最新コードを使う。
 * @returns {void}
 */
export function registerServiceWorker() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

  if (import.meta.env.MODE !== 'development') {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch((error) => {
        console.warn('Service Worker registration failed.', error);
      });
    });
    return;
  }

  // 開発中は古い Service Worker とそのキャッシュを残さない。
  window.addEventListener('load', async () => {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)));
    }
  });
}
