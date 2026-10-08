/**
 * 範囲指定共有カレンダーのコピー・同期・削除を担う純粋モジュール。
 * Vue / Pinia に依存しないため、ページ側のコンポーザブルと
 * Service Worker（src/sw.js）のバックグラウンド同期の両方から利用できる。
 */
import dayjs from '@/services/dayjs.js';
import * as gCalAPI from '@/services/google-calendar-api.js';
import { CACHE_KEYS, readCache, writeCache } from '@/composables/useCache.js';

/** コピーイベントのコピー元を記録する拡張プロパティ名 */
const SOURCE_PROP = 'orbitShareSource';
/** コピーイベントに記録するコピー元の更新日時プロパティ名 */
const SOURCE_UPDATED_PROP = 'orbitShareUpdated';

/**
 * 保存済みの共有条件一覧を読み込む
 * @returns {Promise<OrbitShareSpec[]>}
 */
export async function loadShareSpecs() {
  const saved = await readCache(CACHE_KEYS.SHARE_SPECS, []);
  if (!Array.isArray(saved)) return [];
  return saved.filter((/** @type {any} */ spec) => spec && typeof spec.id === 'string' && Array.isArray(spec.calendarIds));
}

/**
 * 共有条件一覧を保存する
 * @param {OrbitShareSpec[]} specs 共有条件一覧
 * @returns {Promise<void>}
 */
export async function saveShareSpecs(specs) {
  await writeCache(CACHE_KEYS.SHARE_SPECS, specs);
}

/**
 * 共有が有効期限切れかどうか（expiresAt の当日終了までは有効）
 * @param {OrbitShareSpec} spec 共有条件
 * @returns {boolean}
 */
export function isShareSpecExpired(spec) {
  return dayjs().isAfter(dayjs(spec.expiresAt).endOf('day'));
}

/**
 * コピー元イベントをコピー先カレンダー用のペイロードに変換する。
 * 出席者や会議データはコピーしない（招待通知や権限が漏れるのを防ぐため）。
 * freeBusyReader の場合は詳細を伏せて「予定あり」としてコピーする。
 * @param {GoogleCalendarEvent} evt コピー元イベント
 * @param {string} sourceKey コピー元を識別するキー
 * @param {OrbitShareSpec['role']} role 共有権限
 * @returns {Partial<GoogleCalendarEvent>}
 */
export function toShareCopyBody(evt, sourceKey, role) {
  const isFreeBusy = role === 'freeBusyReader';
  return {
    summary: isFreeBusy ? '予定あり' : evt.summary,
    start: evt.start,
    end: evt.end,
    ...(isFreeBusy ? {} : { description: evt.description, location: evt.location }),
    transparency: evt.transparency,
    extendedProperties: {
      private: {
        [SOURCE_PROP]: sourceKey,
        [SOURCE_UPDATED_PROP]: evt.updated ?? '',
      },
    },
  };
}

/**
 * 指定カレンダーのイベントをページネーションを辿って全て取得する
 * @param {string} token アクセストークン
 * @param {string} gCalendarId カレンダー ID
 * @param {GoogleCalendarEventsListQueryParams} [query={}] クエリパラメータ
 * @returns {Promise<GoogleCalendarEvent[]>}
 */
export async function listAllCalendarEvents(token, gCalendarId, query = {}) {
  /** @type {GoogleCalendarEvent[]} */
  const items = [];
  let pageToken;
  do {
    const response = await gCalAPI.listEvents(token, gCalendarId, { ...query, ...(pageToken ? { pageToken } : {}) });
    if (Array.isArray(response?.items)) items.push(...response.items);
    pageToken = response?.nextPageToken;
  } while (pageToken);
  return items;
}

/**
 * 共有条件に合うコピー元イベントを全て取得する
 * @param {OrbitShareSpec} spec 共有条件
 * @param {string} token アクセストークン
 * @returns {Promise<Map<string, {evt: GoogleCalendarEvent, body: Partial<GoogleCalendarEvent>}>>} コピー元キー → イベントとコピー用ペイロード
 */
export async function listShareSourceEvents(spec, token) {
  const timeMin = dayjs(spec.rangeStart).startOf('day').toISOString();
  const timeMax = dayjs(spec.rangeEnd).add(1, 'day').startOf('day').toISOString();
  const wanted = new Map();
  for (const calendarId of spec.calendarIds) {
    const events = await listAllCalendarEvents(token, calendarId, { timeMin, timeMax, singleEvents: true, orderBy: 'startTime' });
    for (const evt of events) {
      if (!evt?.id || evt.status === 'cancelled') continue;
      const key = `${calendarId}:${evt.id}`;
      wanted.set(key, { evt, body: toShareCopyBody(evt, key, spec.role) });
    }
  }
  return wanted;
}

/**
 * コピーカレンダー内の既存コピーイベントを取得する
 * @param {string} copyCalendarId コピーカレンダー ID
 * @param {string} token アクセストークン
 * @returns {Promise<Map<string, GoogleCalendarEvent>>} コピー元キー → コピーイベント
 */
export async function listShareCopyEvents(copyCalendarId, token) {
  const events = await listAllCalendarEvents(token, copyCalendarId, { showDeleted: false });
  const map = new Map();
  for (const evt of events) {
    const sourceKey = evt?.extendedProperties?.private?.[SOURCE_PROP];
    if (typeof sourceKey === 'string') map.set(sourceKey, evt);
  }
  return map;
}

/**
 * 共有を解除してコピーカレンダーを削除する（カレンダーの削除で相手側からも消える）。
 * @param {OrbitShareSpec} spec 共有条件
 * @param {string} token アクセストークン
 * @returns {Promise<void>}
 */
export async function deleteShareCalendar(spec, token) {
  if (!spec.copyCalendarId || !token) return;
  await gCalAPI.deleteCalendar(token, spec.copyCalendarId).catch((/** @type {any} */ error) => {
    if (error?.status !== 404 && error?.status !== 410) throw error;
  });
}

/**
 * 1件の共有についてコピーカレンダーとコピー元を同期する。
 * 期限切れの場合はコピーカレンダーごと削除する。
 * @param {OrbitShareSpec} spec 共有条件
 * @param {string} token アクセストークン
 * @returns {Promise<{spec: OrbitShareSpec, removed: boolean}>} 同期結果（removed は期限切れで削除した場合 true）
 */
export async function syncShareSpec(spec, token) {
  if (isShareSpecExpired(spec)) {
    await deleteShareCalendar(spec, token);
    return { spec, removed: true };
  }
  if (!spec.copyCalendarId || !token) return { spec, removed: false };

  const [wanted, copyMap] = await Promise.all([listShareSourceEvents(spec, token), listShareCopyEvents(spec.copyCalendarId, token)]);

  for (const [key, { body }] of wanted) {
    const existing = copyMap.get(key);
    copyMap.delete(key);
    if (!existing?.id) {
      await gCalAPI.insertEvent(token, spec.copyCalendarId, body);
    } else if (existing.extendedProperties?.private?.[SOURCE_UPDATED_PROP] !== body.extendedProperties?.private?.[SOURCE_UPDATED_PROP]) {
      await gCalAPI.patchEvent(token, spec.copyCalendarId, existing.id, body);
    }
  }
  // コピー元に存在しないコピー（削除済み・範囲外になった予定）を除去
  for (const evt of copyMap.values()) {
    if (evt?.id) await gCalAPI.deleteEvent(token, spec.copyCalendarId, evt.id).catch(() => null);
  }

  spec.lastSyncedAt = dayjs().toISOString();
  return { spec, removed: false };
}

/**
 * 共有条件に従ってコピーカレンダーの作成・予定コピー・ACL 共有を行う。
 * @param {{title: string, recipient: string, calendarIds: string[], rangeStart: string, rangeEnd: string, expiresAt: string, role: 'freeBusyReader'|'reader'}} input 共有条件
 * @param {string} token アクセストークン
 * @param {(message: string) => void} [onProgress] 進行状況メッセージのコールバック
 * @returns {Promise<OrbitShareSpec>} 作成された共有条件
 */
export async function createShareSpec(input, token, onProgress) {
  const spec = /** @type {OrbitShareSpec} */ ({
    id: `share-${globalThis.crypto?.randomUUID?.() ?? `${dayjs().valueOf()}-${Math.random().toString(36).slice(2)}`}`,
    title: input.title,
    recipient: input.recipient.trim(),
    calendarIds: [...input.calendarIds],
    rangeStart: input.rangeStart,
    rangeEnd: input.rangeEnd,
    expiresAt: input.expiresAt,
    role: input.role,
    copyCalendarId: null,
    aclRuleId: null,
    createdAt: dayjs().toISOString(),
    lastSyncedAt: null,
  });

  try {
    // コピーカレンダーの作成
    onProgress?.('共有用のカレンダーを作成しています...');
    const calendar = await gCalAPI.insertCalendar(token, {
      summary: spec.title,
      description: `${spec.rangeStart} 〜 ${spec.rangeEnd} の予定を ${spec.recipient} と共有（Orbit により自動作成）`,
    });
    if (!calendar?.id) throw new Error('共有用カレンダーを作成できませんでした。');
    spec.copyCalendarId = calendar.id;

    // 条件に合う予定をコピー
    onProgress?.('予定をコピーしています...');
    const wanted = await listShareSourceEvents(spec, token);
    for (const { body } of wanted.values()) {
      await gCalAPI.insertEvent(token, calendar.id, body);
    }
    spec.lastSyncedAt = dayjs().toISOString();

    // 相手に共有（閲覧権限を付与して招待メールを送信）
    onProgress?.('共有設定を登録しています...');
    const rule = await gCalAPI.insertAcl(token, calendar.id, { scope: { type: 'user', value: spec.recipient }, role: spec.role }, { sendNotifications: true });
    spec.aclRuleId = rule?.id ?? null;
    return spec;
  } catch (error) {
    // 途中で失敗した場合は作成したカレンダーを掃除する
    if (spec.copyCalendarId) await gCalAPI.deleteCalendar(token, spec.copyCalendarId).catch(() => null);
    throw error;
  }
}

/**
 * 保存済みの全共有を同期する。Service Worker からも呼べる純粋な一括処理。
 * @param {string} token アクセストークン
 * @returns {Promise<OrbitShareSpec[]>} 同期後の共有条件一覧
 */
export async function syncAllStoredShareSpecs(token) {
  const specs = await loadShareSpecs();
  /** @type {OrbitShareSpec[]} */
  const remaining = [];
  for (const spec of specs) {
    try {
      const result = await syncShareSpec(spec, token);
      if (!result.removed) remaining.push(result.spec);
    } catch (error) {
      console.warn(`Failed to sync shared calendar ${spec.copyCalendarId}.`, error);
      remaining.push(spec);
    }
  }
  await saveShareSpecs(remaining);
  return remaining;
}
