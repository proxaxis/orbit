/**
 * @typedef {import('./google-calendar-colors.d.ts').GoogleCalendarEventColorId} GoogleCalendarEventColorId
 * @typedef {import('./google-calendar-colors.d.ts').GoogleCalendarListColorId} GoogleCalendarListColorId
 * @typedef {import('./google-calendar-colors.d.ts').GoogleCalendarColorInfo} GoogleCalendarColorInfo
 * @typedef {Record<import('./google-calendar-colors.d.ts').GoogleCalendarEventColorId, GoogleCalendarColorInfo>} GoogleCalendarEventColors
 * @typedef {Record<import('./google-calendar-colors.d.ts').GoogleCalendarListColorId, GoogleCalendarColorInfo>} GoogleCalendarListColors
 */

/**
 * イベント用カラーパレット詳細マップ（1 ~ 11）
 * @type {GoogleCalendarEventColors}
 */
export const GOOGLE_CALENDAR_EVENT_COLORS = {
  '1': { name: 'Lavender', background: '#a4bdfc', foreground: '#1d1d1d' },
  '2': { name: 'Sage', background: '#7ae7bf', foreground: '#1d1d1d' },
  '3': { name: 'Grape', background: '#dbadff', foreground: '#1d1d1d' },
  '4': { name: 'Flamingo', background: '#ff887c', foreground: '#1d1d1d' },
  '5': { name: 'Banana', background: '#fbd75b', foreground: '#1d1d1d' },
  '6': { name: 'Tangerine', background: '#ffb878', foreground: '#1d1d1d' },
  '7': { name: 'Peacock', background: '#46d6db', foreground: '#1d1d1d' },
  '8': { name: 'Graphite', background: '#e1e1e1', foreground: '#1d1d1d' },
  '9': { name: 'Blueberry', background: '#5484ed', foreground: '#ffffff' },
  '10': { name: 'Basil', background: '#51b749', foreground: '#ffffff' },
  '11': { name: 'Tomato', background: '#dc2127', foreground: '#ffffff' },
};

/**
 * カレンダーリスト用カラーパレット詳細マップ (1 ~ 24)
 * @type {GoogleCalendarListColors}
 */
export const GOOGLE_CALENDAR_LIST_COLORS = {
  '1': { name: 'Cocoa', background: '#ac725e', foreground: '#ffffff' },
  '2': { name: 'Flamingo', background: '#d06b64', foreground: '#ffffff' },
  '3': { name: 'Tomato', background: '#f83a22', foreground: '#ffffff' },
  '4': { name: 'Tangerine', background: '#fa573c', foreground: '#ffffff' },
  '5': { name: 'Pumpkin', background: '#ff7537', foreground: '#ffffff' },
  '6': { name: 'Mango', background: '#ffad46', foreground: '#1d1d1d' },
  '7': { name: 'Eucalyptus', background: '#42d692', foreground: '#1d1d1d' },
  '8': { name: 'Basil', background: '#16a765', foreground: '#ffffff' },
  '9': { name: 'Pistachio', background: '#7bd148', foreground: '#1d1d1d' },
  '10': { name: 'Avocado', background: '#b3dc6c', foreground: '#1d1d1d' },
  '11': { name: 'Citron', background: '#fbe983', foreground: '#1d1d1d' },
  '12': { name: 'Banana', background: '#fad165', foreground: '#1d1d1d' },
  '13': { name: 'Sage', background: '#92e1c0', foreground: '#1d1d1d' },
  '14': { name: 'Peacock', background: '#9fe1e7', foreground: '#1d1d1d' },
  '15': { name: 'Cobalt', background: '#9fc6e7', foreground: '#1d1d1d' },
  '16': { name: 'Blueberry', background: '#4986e7', foreground: '#ffffff' },
  '17': { name: 'Wisteria', background: '#9a9cff', foreground: '#1d1d1d' },
  '18': { name: 'Amethyst', background: '#b99aff', foreground: '#1d1d1d' },
  '19': { name: 'Grape', background: '#c2c2fb', foreground: '#1d1d1d' },
  '20': { name: 'Radicchio', background: '#cabdbf', foreground: '#1d1d1d' },
  '21': { name: 'Lavender', background: '#cca6ac', foreground: '#1d1d1d' },
  '22': { name: 'Cherry', background: '#f691b2', foreground: '#1d1d1d' },
  '23': { name: 'Rose', background: '#cd74e6', foreground: '#ffffff' },
  '24': { name: 'Graphite', background: '#a47ae2', foreground: '#ffffff' },
};

/**
 * ランダムな Google Calendar Event の Color Id を取得する
 * @returns {{ index: number } & GoogleCalendarColorInfo }} ランダムな Color Id
 */
export function getRandomEventColorId() {
  const index = Math.floor(Math.random() * 11) + 1;
  const colorId = /** @type {import('./google-calendar-colors.d.ts').GoogleCalendarEventColorId} */ (index.toString());
  return { index, ...GOOGLE_CALENDAR_EVENT_COLORS[colorId] };
}

/**
 * ランダムな Google Calendar List の Color Id を取得する
 * @returns {{ index: number } & GoogleCalendarColorInfo} ランダムな Color Id
 */
export function getRandomCalendarListColorId() {
  const index = Math.floor(Math.random() * 24) + 1;
  const colorId = /** @type {import('./google-calendar-colors.d.ts').GoogleCalendarListColorId} */ (index.toString());
  return { index, ...GOOGLE_CALENDAR_LIST_COLORS[colorId] };
}

/**
 * 指定された Color Id に一致する Google Calendar List の Color 情報を取得
 * @param {GoogleCalendarListColorId} cColorId
 * @returns {GoogleCalendarColorInfo|undefined}
 */
export function getCalendarListColorInfoById(cColorId) {
  return GOOGLE_CALENDAR_LIST_COLORS[cColorId];
}

/**
 * 指定された Color Id に一致する Google Calendar Event の Color 情報を取得
 * @param {GoogleCalendarEventColorId} eColorId
 * @returns {GoogleCalendarColorInfo|undefined}
 */
export function getCalendarEventColorInfoById(eColorId) {
  return GOOGLE_CALENDAR_EVENT_COLORS[eColorId];
}
