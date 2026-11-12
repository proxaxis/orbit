/**
 * Google カレンダーの誕生日カレンダーの定義と判定ヘルパー。
 * 連絡先の誕生日・記念日から Google 側が自動生成する特殊カレンダーで、
 * ユーザーの calendarList に含まれない場合でも events.list で参照できる。
 * 本アプリでは一覧に常時表示する「特殊カレンダー」として扱い、
 * 可能な操作は表示・非表示のみとする（改名・色変更・共有・削除は不可）。
 * Vue/Pinia に依存しないためサービス層に置く。
 */

/** @type {string} Google の誕生日カレンダーのカレンダー ID */
export const BIRTHDAY_CALENDAR_ID = 'addressbook#contacts@group.v.calendar.google.com';

/**
 * calendarList に誕生日カレンダーが無い場合に一覧表示へ注入する仮想エントリ。
 * `birthday` フラグはリモート差分チェックでサーバ由来エントリと区別するための目印で、
 * API 応答に存在しないアプリ固有のプロパティ。
 * @type {GoogleCalendarListEntry & { birthday: true }}
 */
export const BIRTHDAY_CALENDAR_ENTRY = Object.freeze({
  kind: 'calendar#calendarListEntry',
  id: BIRTHDAY_CALENDAR_ID,
  summary: '誕生日',
  description: '連絡先の誕生日・記念日を Google が自動で生成するカレンダーです。表示・非表示のみ切り替えられます。',
  colorId: '22',
  backgroundColor: '#f691b2',
  foregroundColor: '#ffffff',
  accessRole: 'reader',
  birthday: true,
});

/**
 * 指定した ID が誕生日カレンダーのものか判定する
 * @param {string|null|undefined} calendarId カレンダー ID
 * @returns {boolean} 誕生日カレンダーの ID なら true
 */
export function isBirthdayCalendarId(calendarId) {
  return calendarId === BIRTHDAY_CALENDAR_ID;
}

/**
 * カレンダーリストエントリが誕生日カレンダーか判定する。
 * 仮想エントリだけでなく Google が返す同名エントリにも一致させ、
 * 表示・非表示以外の操作を一律で禁止する。
 * @param {GoogleCalendarListEntry|null|undefined} calendar カレンダーリストエントリ
 * @returns {boolean} 誕生日カレンダーなら true
 */
export function isBirthdayCalendarEntry(calendar) {
  return isBirthdayCalendarId(calendar?.id);
}

/**
 * カレンダー固有の events.list クエリを付与する。
 * 誕生日イベントは eventTypes のデフォルト（default など）に含まれないため、
 * 誕生日カレンダーに対しては eventTypes=birthday を明示指定する。
 * @param {string} gCalendarId カレンダー ID
 * @param {GoogleCalendarEventsListQueryParams} [query={}] 元のクエリパラメータ
 * @returns {GoogleCalendarEventsListQueryParams} 調整後のクエリパラメータ
 */
export function eventsQueryForCalendar(gCalendarId, query = {}) {
  return isBirthdayCalendarId(gCalendarId) ? { ...query, eventTypes: ['birthday'] } : query;
}
