/**
 * Capacitor LocalNotifications プラグインへのブリッジ。
 * Web の Notification/Push API が使えない Android WebView でも、OS の通知
 * スケジューラへ直接登録してアプリ未起動・オフラインでも通知を届ける。
 * プラグインは WebView ブリッジ経由のグローバル (Capacitor.Plugins) から
 * 取得するため、Web バンドルにネイティブ依存を持ち込まない。
 */

/** @type {string} 通知タップ時の遷移先 URL を保持する extra キー */
const EXTRA_URL_KEY = 'url';

/**
 * Capacitor プラグインオブジェクトを取得する
 * @returns {any} LocalNotifications プラグイン（無ければ undefined）
 */
function plugin() {
  return globalThis.Capacitor?.Plugins?.LocalNotifications;
}

/**
 * ネイティブ通知が使えるかどうか（Capacitor 上かつプラグイン存在時のみ true）
 * @returns {boolean}
 */
export function nativeNotificationsSupported() {
  return Boolean(globalThis.Capacitor?.isNativePlatform?.() && plugin());
}

/**
 * 通知キーから安定した整数 ID を生成する（Android の通知 ID は整数必須）
 * @param {string} key 通知キー
 * @returns {number} 31bit の正の整数
 */
export function nativeNotificationId(key) {
  let hash = 5381;
  for (let i = 0; i < key.length; i++) hash = (hash * 33) ^ key.charCodeAt(i);
  return hash & 0x7fffffff;
}

/**
 * 通知権限の状態を返す
 * @returns {Promise<'granted'|'denied'|'prompt'|'unsupported'>}
 */
export async function nativeNotificationPermission() {
  const local = plugin();
  if (!local) return 'unsupported';
  try {
    const status = await local.checkPermissions();
    return status?.display ?? 'prompt';
  } catch {
    return 'unsupported';
  }
}

/**
 * 通知権限を要求する
 * @returns {Promise<'granted'|'denied'|'prompt'|'unsupported'>}
 */
export async function requestNativeNotificationPermission() {
  const local = plugin();
  if (!local) return 'unsupported';
  try {
    const status = await local.requestPermissions();
    return status?.display ?? 'denied';
  } catch {
    return 'denied';
  }
}

/**
 * 通知スケジュールを OS へ同期する。
 * 既存の登録済み通知と差分を取り、不要になった分をキャンセルして新規分のみ登録する。
 * @param {Array<{key: string, fireAt: number, start: number, eid: string, cid: string, summary?: string, icon?: string|null, minutes: number, title?: string, body?: string}>} entries 通知スケジュール
 * @param {(entry: {key: string, fireAt: number, start: number, eid: string, cid: string, summary?: string, icon?: string|null, minutes: number, title?: string, body?: string}, url: string) => {title: string, options: any}} formatNotification 通知文言の生成関数
 * @returns {Promise<void>}
 */
export async function syncNativeNotifications(entries, formatNotification) {
  const local = plugin();
  if (!local) return;
  /** @type {Map<number, any>} 今回登録すべき通知 ID → エントリ */
  const wanted = new Map();
  for (const entry of entries) {
    wanted.set(nativeNotificationId(entry.key), entry);
  }
  try {
    const { notifications: pending } = await local.getPending();
    const stale = (pending ?? []).filter((/** @type {any} */ n) => !wanted.has(n.id)).map((/** @type {any} */ n) => ({ id: n.id }));
    if (stale.length) await local.cancel({ notifications: stale });
    const pendingIds = new Set((pending ?? []).map((/** @type {any} */ n) => n.id));
    const notifications = [...wanted.values()]
      .filter((entry) => !pendingIds.has(nativeNotificationId(entry.key)))
      .map((entry) => {
        const url = `evt/detail?eid=${encodeURIComponent(entry.eid)}&cid=${encodeURIComponent(entry.cid)}`;
        const { title, options } = formatNotification(entry, url);
        return {
          id: nativeNotificationId(entry.key),
          title,
          body: options?.body ?? '',
          schedule: { at: new Date(entry.fireAt), allowWhileIdle: true },
          extra: { [EXTRA_URL_KEY]: url, key: entry.key, eid: entry.eid, cid: entry.cid },
        };
      });
    if (notifications.length) await local.schedule({ notifications });
  } catch (error) {
    console.warn('Native notification schedule failed.', error);
  }
}

/**
 * ネイティブ通知を即時に表示する（期限超過分の配信用）
 * @param {string} title 通知タイトル
 * @param {NotificationOptions} options 通知オプション
 * @returns {Promise<void>}
 */
export async function showNativeNotification(title, options) {
  const local = plugin();
  if (!local) return;
  const key = String(options?.tag ?? `native-${Date.now()}`);
  await local.schedule({
    notifications: [
      {
        id: nativeNotificationId(key),
        title,
        body: options?.body ?? '',
        schedule: { at: new Date(Date.now() + 500), allowWhileIdle: true },
        extra: { [EXTRA_URL_KEY]: options?.data?.url ?? '', key, eid: options?.data?.eid ?? '', cid: options?.data?.cid ?? '' },
      },
    ],
  });
}

/**
 * 登録済みのネイティブ通知を全てキャンセルする（アカウント切替時など）
 * @returns {Promise<void>}
 */
export async function cancelAllNativeNotifications() {
  const local = plugin();
  if (!local) return;
  try {
    const { notifications: pending } = await local.getPending();
    if (pending?.length) await local.cancel({ notifications: pending });
  } catch (error) {
    console.warn('Native notification cancel failed.', error);
  }
}

/**
 * 通知タップ時のハンドラを登録する
 * @param {(url: string) => void} onOpen 通知の extra.url を受け取るコールバック
 * @returns {Promise<void>}
 */
export async function initNativeNotificationActions(onOpen) {
  const local = plugin();
  if (!local) return;
  await local.addListener('localNotificationActionPerformed', (/** @type {any} */ action) => {
    const url = action?.notification?.extra?.[EXTRA_URL_KEY];
    if (typeof url === 'string' && url) onOpen(url);
  });
}
