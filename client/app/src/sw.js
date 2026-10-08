/**
 * Orbit の Service Worker。
 * `vite build --config vite.sw.config.js` でバンドルされ dist/sw.js に出力される。
 * - アプリシェルのキャッシュとオフライン応答
 * - アプリ未起動時のイベント通知配信（Background Sync / Periodic Background Sync）
 * - オフライン中に保留されたイベント操作キューの再送
 * - 範囲指定共有カレンダーのバックグラウンド同期
 */
import dayjs from '@/services/dayjs.js';
import { CACHE_KEYS, SYNC_TAGS, readCache, writeCache } from '@/composables/useCache.js';
import { processEventOperations, readEventOperations, writeEventOperations } from '@/services/event-offline.js';
import { syncAllStoredShareSpecs } from '@/services/share-sync.js';

/** @type {string} アプリシェルのキャッシュ名 */
const CACHE_NAME = 'orbit-shell-v1';
/** @type {string[]} プリキャッシュするアプリシェル */
const APP_SHELL = ['/', '/index.html', '/manifest.webmanifest', '/favicon.ico', '/icon-192.png', '/icon-512.png'];

/**
 * Service Worker が使う Google API アクセストークンを取得する。
 * ページ側がトークン取得・更新のたびに IndexedDB へ保存したものを読む。
 * @returns {Promise<string>} アクセストークン（未取得なら空文字）
 */
async function storedAccessToken() {
  const token = await readCache(CACHE_KEYS.ACCESS_TOKEN, '');
  return typeof token === 'string' ? token : '';
}

/**
 * 開いているアプリウィンドウへメッセージを送信する
 * @param {any} message 送信するメッセージ
 * @returns {Promise<void>}
 */
async function broadcastToClients(message) {
  const windowClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of windowClients) {
    if (new URL(client.url).origin === self.location.origin) client.postMessage(message);
  }
}

/**
 * アプリのウィンドウが開いているかどうか。
 * 開いている場合はページ側のタイマーが通知を担当するため、SW 側は配信しない。
 * @returns {Promise<boolean>}
 */
async function hasAppWindow() {
  const windowClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  return windowClients.some((client) => new URL(client.url).origin === self.location.origin);
}

/**
 * 通知から開くべきイベント詳細ページの URL
 * @param {string} eid イベント ID
 * @param {string} cid カレンダー ID
 * @returns {string}
 */
function eventDetailUrl(eid, cid) {
  return new URL(`evt/detail?eid=${encodeURIComponent(eid)}&cid=${encodeURIComponent(cid)}`, self.registration.scope).href;
}

/**
 * 保存済みスケジュールを走査し、通知時刻を過ぎた（ただし開始前の）予定の通知を配信する。
 * アプリのウィンドウが開いている間はページ側が配信するため何もしない。
 * @returns {Promise<void>}
 */
async function deliverDueNotifications() {
  if (await hasAppWindow()) return;

  const [schedule, notified] = await Promise.all([readCache(CACHE_KEYS.NOTIFICATION_SCHEDULE, []), readCache(CACHE_KEYS.NOTIFIED_EVENTS, [])]);
  const notifiedSet = new Set(Array.isArray(notified) ? notified : []);
  const now = dayjs();
  /** @type {any[]} 次回以降に持ち越す通知スケジュール */
  const remaining = [];
  let notifiedDirty = false;

  for (const entry of Array.isArray(schedule) ? schedule : []) {
    if (!entry?.key || notifiedSet.has(entry.key)) continue;
    if (dayjs(entry.start).isBefore(now) || dayjs(entry.start).isSame(now)) continue; // 開始済みの予定は通知しない
    if (dayjs(entry.fireAt).isAfter(now)) {
      remaining.push(entry);
      continue;
    }
    notifiedSet.add(entry.key);
    notifiedDirty = true;
    const minutesLeft = Math.max(0, dayjs(entry.start).diff(now, 'minute'));
    const title = `${entry.icon ?? '📌'} ${entry.summary ?? '予定'}`;
    const body = `${dayjs(entry.start).format('M月D日 (ddd) HH:mm')} 開始（${entry.minutes > 0 ? `${entry.minutes}分前` : '開始時刻'} / あと${minutesLeft}分）`;
    await self.registration.showNotification(title, {
      body,
      tag: `orbit-event-${entry.key}`,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { eid: entry.eid, cid: entry.cid, url: eventDetailUrl(entry.eid, entry.cid) },
    });
  }

  if (notifiedDirty) await writeCache(CACHE_KEYS.NOTIFIED_EVENTS, [...notifiedSet]);
  await writeCache(CACHE_KEYS.NOTIFICATION_SCHEDULE, remaining);
}

/**
 * オフライン中に保留されたイベント操作キューを API へ再送する。
 * 成功した場合はページ側へキャッシュ更新を促すメッセージを送る。
 * @returns {Promise<void>}
 */
async function processOfflineEventQueue() {
  const [token, operations] = await Promise.all([storedAccessToken(), readEventOperations()]);
  if (!token || !operations.length) return;

  const { remaining, synced } = await processEventOperations(operations, token);
  await writeEventOperations(remaining);
  if (synced) await broadcastToClients({ type: 'orbit-queue-synced' });
  if (remaining.length) await broadcastToClients({ type: 'orbit-token-expired' });
}

/**
 * 保存済みの範囲指定共有を全て同期する。
 * 完了後、ページ側へ共有条件の再読み込みを促すメッセージを送る。
 * @returns {Promise<void>}
 */
async function syncSharedCalendars() {
  const token = await storedAccessToken();
  if (!token) return;
  try {
    await syncAllStoredShareSpecs(token);
    await broadcastToClients({ type: 'orbit-shares-changed' });
  } catch (error) {
    console.warn('Background share sync failed.', error);
    await broadcastToClients({ type: 'orbit-token-expired' });
  }
}

/**
 * 同期タグに応じたバックグラウンド処理を実行する
 * @param {string} tag 同期タグ（SYNC_TAGS の値）
 * @returns {Promise<void>}
 */
async function runSyncTask(tag) {
  if (tag === SYNC_TAGS.NOTIFICATIONS) return deliverDueNotifications();
  if (tag === SYNC_TAGS.OFFLINE_QUEUE) return processOfflineEventQueue();
  if (tag === SYNC_TAGS.SHARE_SYNC) return syncSharedCalendars();
  return undefined;
}

self.addEventListener('install', (/** @type {any} */ event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (/** @type {any} */ event) => {
  event.waitUntil(self.clients.claim().then(() => deliverDueNotifications()));
});

// ページが閉じている間の起き上がり経路（対応ブラウザのみ）
self.addEventListener('sync', (/** @type {any} */ event) => {
  event.waitUntil(runSyncTask(event.tag));
});

self.addEventListener('periodicsync', (/** @type {any} */ event) => {
  event.waitUntil(runSyncTask(event.tag));
});

self.addEventListener('notificationclick', (/** @type {any} */ event) => {
  event.notification.close();
  const data = event.notification?.data ?? {};
  const targetUrl = typeof data.url === 'string' && data.url ? data.url : new URL('/', self.registration.scope).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      const client = windowClients.find((/** @type {any} */ item) => new URL(item.url).origin === self.location.origin);
      if (client) {
        // 既に開いているアプリへ SPA 内遷移を指示してからフォーカスする
        client.postMessage({ type: 'orbit-open-event', eid: data.eid ?? null, cid: data.cid ?? null, url: targetUrl });
        return client.focus();
      }
      return self.clients.openWindow(targetUrl);
    }),
  );
});

self.addEventListener('fetch', (/** @type {any} */ event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then(
      (cached) =>
        cached ??
        fetch(event.request)
          .then((response) => {
            if (response.ok && new URL(event.request.url).origin === self.location.origin) {
              const copy = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
            }
            return response;
          })
          .catch(() => caches.match('/index.html')),
    ),
  );
});
