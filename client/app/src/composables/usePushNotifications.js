/**
 * Web Push を使ったモバイル端末向け通知配信を担うコンポーザブル。
 *
 * ページ側のタイマーや Periodic Background Sync はアプリ（またはブラウザ）が
 * 閉じているモバイル端末では動作しないため、購読情報と通知スケジュールを
 * BFF サーバへ送り、BFF が通知時刻に Push を送信する。
 *
 * BFF 側の期待エンドポイント（cookie 認証）:
 * - GET  /api/push/vapid-key       → { publicKey: string }（VITE_VAPID_PUBLIC_KEY があればそちら優先）
 * - POST /api/push/subscriptions   → { subscription: PushSubscriptionJSON, notifications: [{key, fireAt, notification: {title, options}}] }
 *   BFF は fireAt 時刻に subscription.endpoint へ notification を Push 送信する。
 *   notifications が空ならスケジュール解除として扱う。
 *
 * BFF が未対応の場合は静かにスキップし、既存のタイマー/Periodic Sync 経路が動き続ける。
 */
import dayjs from '@/services/dayjs.js';
import { BFF_BASE_URL } from '@/stores/auth.js';
import { serviceWorkerRegistration } from '@/composables/useCache.js';

/** @type {string|null} 取得済みの VAPID 公開鍵（null は未試行） */
let cachedVapidKey = null;

/** @type {string} 直近に送信したスケジュールのフィンガープリント（変更がなければ再送しない） */
let lastSyncedFingerprint = '';

/**
 * Web Push が利用可能かどうか
 * @returns {boolean}
 */
export function pushNotificationsSupported() {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window;
}

/**
 * VAPID 公開鍵を取得する。環境変数を優先し、未設定なら BFF から取得する。
 * @returns {Promise<string|null>} 公開鍵（取得不能・BFF 未対応なら null）
 */
async function fetchVapidPublicKey() {
  if (cachedVapidKey) return cachedVapidKey;
  const fromEnv = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  if (fromEnv) {
    cachedVapidKey = fromEnv;
    return cachedVapidKey;
  }
  try {
    const res = await fetch(`${BFF_BASE_URL}/api/push/vapid-key`, { credentials: 'include' });
    if (!res.ok) return null;
    const data = await res.json();
    if (typeof data?.publicKey === 'string' && data.publicKey) cachedVapidKey = data.publicKey;
    return cachedVapidKey;
  } catch {
    return null;
  }
}

/**
 * base64url 形式の VAPID 公開鍵を Uint8Array に変換する
 * @param {string} base64 base64url 文字列
 * @returns {Uint8Array<ArrayBuffer>}
 */
function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

/**
 * プッシュ購読を確立して返す。既存の購読があれば再利用する。
 * 通知許可の取得後に呼ぶこと。
 * @returns {Promise<PushSubscription|null>}
 */
export async function ensurePushSubscription() {
  if (!pushNotificationsSupported()) return null;
  try {
    const registration = await serviceWorkerRegistration();
    if (!registration?.pushManager) return null;
    const existing = await registration.pushManager.getSubscription();
    if (existing) return existing;
    const applicationServerKey = await fetchVapidPublicKey();
    /** @type {PushSubscriptionOptionsInit} */
    const options = { userVisibleOnly: true };
    if (applicationServerKey) options.applicationServerKey = urlBase64ToUint8Array(applicationServerKey);
    return await registration.pushManager.subscribe(options);
  } catch (error) {
    console.warn('Push subscription failed.', error);
    return null;
  }
}

/**
 * 通知スケジュールを購読情報とともに BFF へ送信する。
 * 前回送信分と内容が同じならスキップする。
 * @param {Array<{key: string, fireAt: number, start: number, eid: string, cid: string, summary: string, icon: string|null, minutes: number}>} entries 通知スケジュール
 * @returns {Promise<void>}
 */
export async function syncPushSchedule(entries) {
  if (!pushNotificationsSupported()) return;
  const subscription = await ensurePushSubscription();
  if (!subscription) return;

  const notifications = entries.map((entry) => ({
    key: entry.key,
    fireAt: entry.fireAt,
    notification: {
      title: `${entry.icon ?? ''} ${entry.summary ?? '予定'}`.trim(),
      options: {
        body: `${dayjs(entry.start).format('M月D日 (ddd) HH:mm')} 開始（${entry.minutes > 0 ? `${entry.minutes}分前` : '開始時刻'}）`,
        tag: `orbit-event-${entry.key}`,
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        data: { eid: entry.eid, cid: entry.cid, key: entry.key, url: `${import.meta.env.BASE_URL}evt/detail?eid=${encodeURIComponent(entry.eid)}&cid=${encodeURIComponent(entry.cid)}` },
      },
    },
  }));

  const fingerprint = `${subscription.endpoint}|${JSON.stringify(notifications)}`;
  if (fingerprint === lastSyncedFingerprint) return;

  try {
    const res = await fetch(`${BFF_BASE_URL}/api/push/subscriptions`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: subscription.toJSON(), notifications }),
    });
    if (!res.ok) {
      console.warn(`Push schedule upload failed: ${res.status}`);
      return;
    }
    lastSyncedFingerprint = fingerprint;
  } catch (error) {
    console.warn('Push schedule upload failed.', error);
  }
}
