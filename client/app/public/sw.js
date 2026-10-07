const CACHE_NAME = 'orbit-shell-v1';
const APP_SHELL = ['/', '/index.html', '/manifest.webmanifest', '/favicon.ico', '/icon-192.png', '/icon-512.png'];

// アプリ側（src/services/offline-storage.js）と共有する IndexedDB
const DB_NAME = 'orbit-offline';
const DB_STORE = 'settings';
/** ページ側が書き込む今後の通知スケジュール */
const SCHEDULE_KEY = 'notification-schedule';
/** 送信済み通知キー（ページ側と共有して重複通知を防ぐ） */
const NOTIFIED_KEY = 'notified-events';
/** Background Sync / Periodic Background Sync のタグ */
const SYNC_TAG = 'orbit-notifications';

/**
 * IndexedDB から値を読み込む（src/services/offline-storage.js の readOffline と同等）
 * @param {string} key
 * @param {any} fallback
 * @returns {Promise<any>}
 */
function idbGet(key, fallback) {
  return new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME);
    request.onerror = () => resolve(fallback);
    request.onsuccess = () => {
      const database = request.result;
      try {
        const get = database.transaction(DB_STORE, 'readonly').objectStore(DB_STORE).get(key);
        get.onsuccess = () => {
          database.close();
          resolve(get.result ?? fallback);
        };
        get.onerror = () => {
          database.close();
          resolve(fallback);
        };
      } catch {
        database.close();
        resolve(fallback);
      }
    };
  });
}

/**
 * IndexedDB に値を書き込む（src/services/offline-storage.js の writeOffline と同等）
 * @param {string} key
 * @param {any} value
 * @returns {Promise<void>}
 */
function idbPut(key, value) {
  return new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME);
    request.onerror = () => resolve();
    request.onsuccess = () => {
      const database = request.result;
      try {
        const put = database.transaction(DB_STORE, 'readwrite').objectStore(DB_STORE).put(value, key);
        put.onsuccess = put.onerror = () => {
          database.close();
          resolve();
        };
      } catch {
        database.close();
        resolve();
      }
    };
  });
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

  const [schedule, notified] = await Promise.all([idbGet(SCHEDULE_KEY, []), idbGet(NOTIFIED_KEY, [])]);
  const notifiedSet = new Set(Array.isArray(notified) ? notified : []);
  const now = Date.now();
  const remaining = [];
  let notifiedDirty = false;

  for (const entry of Array.isArray(schedule) ? schedule : []) {
    if (!entry?.key || notifiedSet.has(entry.key)) continue;
    if (entry.start <= now) continue; // 開始済みの予定は通知しない
    if (entry.fireAt > now) {
      remaining.push(entry);
      continue;
    }
    notifiedSet.add(entry.key);
    notifiedDirty = true;
    const minutesLeft = Math.max(0, Math.round((entry.start - now) / 60000));
    const startText = new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(entry.start));
    const title = `${entry.icon ?? '📌'} ${entry.summary ?? '予定'}`;
    const body = `${startText} 開始（${entry.minutes > 0 ? `${entry.minutes}分前` : '開始時刻'} / あと${minutesLeft}分）`;
    await self.registration.showNotification(title, {
      body,
      tag: `orbit-event-${entry.key}`,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { eid: entry.eid, cid: entry.cid, url: eventDetailUrl(entry.eid, entry.cid) },
    });
  }

  if (notifiedDirty) await idbPut(NOTIFIED_KEY, [...notifiedSet]);
  await idbPut(SCHEDULE_KEY, remaining);
}

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim().then(() => deliverDueNotifications()));
});

// ページが閉じている間の起き上がり経路（対応ブラウザのみ）
self.addEventListener('sync', (event) => {
  if (event.tag === SYNC_TAG) event.waitUntil(deliverDueNotifications());
});

self.addEventListener('periodicsync', (event) => {
  if (event.tag === SYNC_TAG) event.waitUntil(deliverDueNotifications());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification?.data ?? {};
  const targetUrl = typeof data.url === 'string' && data.url ? data.url : new URL('/', self.registration.scope).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      const client = windowClients.find((item) => new URL(item.url).origin === self.location.origin);
      if (client) {
        // 既に開いているアプリへ SPA 内遷移を指示してからフォーカスする
        client.postMessage({ type: 'orbit-open-event', eid: data.eid ?? null, cid: data.cid ?? null, url: targetUrl });
        return client.focus();
      }
      return self.clients.openWindow(targetUrl);
    }),
  );
});

self.addEventListener('fetch', (event) => {
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
