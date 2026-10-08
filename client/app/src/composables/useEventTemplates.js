/**
 * イベントテンプレート（ひな型）の管理ロジック。
 * テンプレートはイベントの日時以外の情報と、テンプレート名・説明を保持し、
 * IndexedDB キャッシュへ永続化する。モジュールスコープの状態を全画面で共有する。
 */
import { ref } from 'vue';
import dayjs from '@/services/dayjs.js';
import { readCache, writeCache, CACHE_KEYS } from '@/composables/useCache.js';

/** @type {Ref<OrbitEventTemplate[]>} 保存済みイベントテンプレート一覧 */
const templates = ref([]);

/** @type {Promise<void>|null} 初回読み込みの保留中プロミス */
let loadPromise = null;

/** テンプレート一覧をキャッシュへ保存する */
async function persist() {
  await writeCache(CACHE_KEYS.EVENT_TEMPLATES, templates.value);
}

/**
 * イベントテンプレートの一覧状態と操作を提供する。
 * @returns {{
 *   templates: Ref<OrbitEventTemplate[]>,
 *   ensureLoaded: () => Promise<void>,
 *   findById: (id: string) => OrbitEventTemplate|null,
 *   addTemplate: (template: OrbitEventTemplate) => Promise<OrbitEventTemplate>,
 *   removeTemplate: (id: string) => Promise<void>,
 * }}
 */
export function useEventTemplates() {
  /** キャッシュからテンプレート一覧を読み込む（多重呼び出しは共通化する） */
  function ensureLoaded() {
    if (!loadPromise) {
      loadPromise = readCache(CACHE_KEYS.EVENT_TEMPLATES, []).then((saved) => {
        templates.value = Array.isArray(saved) ? saved.filter((template) => template && typeof template.id === 'string') : [];
      });
    }
    return loadPromise;
  }

  /**
   * ID でテンプレートを検索する
   * @param {string} id テンプレート ID
   * @returns {OrbitEventTemplate|null}
   */
  function findById(id) {
    return templates.value.find((template) => template.id === id) ?? null;
  }

  /**
   * テンプレートを追加して永続化する
   * @param {OrbitEventTemplate} template 保存するテンプレート
   * @returns {Promise<OrbitEventTemplate>}
   */
  async function addTemplate(template) {
    templates.value = [...templates.value, template];
    await persist();
    return template;
  }

  /**
   * テンプレートを削除して永続化する
   * @param {string} id 削除するテンプレート ID
   * @returns {Promise<void>}
   */
  async function removeTemplate(id) {
    templates.value = templates.value.filter((template) => template.id !== id);
    await persist();
  }

  return { templates, ensureLoaded, findById, addTemplate, removeTemplate };
}

/**
 * フォームの入力状態からイベントテンプレートを生成する。
 * 日時は保持せず、所要時間（分）のみ保持する。
 * @param {Object} params 生成パラメータ
 * @param {string} params.name テンプレート名
 * @param {string} params.description テンプレートの説明
 * @param {Object} params.snapshot フォームの入力スナップショット
 * @param {string} params.snapshot.summary イベントタイトル
 * @param {string} params.snapshot.description イベントの説明
 * @param {string} params.snapshot.location 場所
 * @param {string} params.snapshot.privacyNote 個人用ノート
 * @param {string} params.snapshot.calendarId 保存先カレンダー ID
 * @param {string} params.snapshot.icon アイコン絵文字
 * @param {boolean} params.snapshot.isAllDay 終日かどうか
 * @param {number} params.snapshot.durationMinutes 所要時間（分）
 * @param {string} params.snapshot.timeZone タイムゾーン
 * @param {{email: string, displayName?: string}[]} params.snapshot.attendees 招待先
 * @param {{value: number, unit: 'minute'|'hour'|'day'}[]} params.snapshot.reminders 通知設定
 * @param {{method: string, minutes: number}[]} params.snapshot.preservedReminderOverrides popup 以外のリマインダー
 * @param {Object} params.snapshot.recurrence 繰り返し設定
 * @param {boolean} params.snapshot.createPhotoAlbum 写真アルバム作成フラグ
 * @param {string[]} [params.snapshot.tags] イベントタグ
 * @returns {OrbitEventTemplate}
 */
export function createEventTemplate({ name, description, snapshot }) {
  /** @type {string} テンプレート ID */
  const id = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `template-${dayjs().valueOf().toString(36)}`;
  return {
    id,
    name,
    description,
    createdAt: dayjs().valueOf(),
    event: {
      summary: snapshot.summary ?? '',
      description: snapshot.description ?? '',
      location: snapshot.location ?? '',
      privacyNote: snapshot.privacyNote ?? '',
      calendarId: snapshot.calendarId ?? '',
      icon: snapshot.icon ?? '',
      isAllDay: Boolean(snapshot.isAllDay),
      durationMinutes: Math.max(1, Number(snapshot.durationMinutes) || 60),
      timeZone: snapshot.timeZone ?? '',
      attendees: (snapshot.attendees ?? []).map((attendee) => ({ email: attendee.email, ...(attendee.displayName ? { displayName: attendee.displayName } : {}) })),
      reminders: (snapshot.reminders ?? []).map((reminder) => ({ ...reminder })),
      preservedReminderOverrides: (snapshot.preservedReminderOverrides ?? []).map((override) => ({ ...override })),
      recurrence: { ...(snapshot.recurrence ?? {}) },
      createPhotoAlbum: Boolean(snapshot.createPhotoAlbum),
      eventColorId: snapshot.eventColorId ?? '',
      tags: Array.isArray(snapshot.tags) ? snapshot.tags.filter((tag) => typeof tag === 'string' && tag.trim()) : [],
    },
  };
}
