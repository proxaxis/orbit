/**
 * 予定タイプ（終日 / 時間指定）ごとのイベントバー表示方法の共有ロジック。
 * 個人設定（userStore.allDayEventBarStyle / timedEventBarStyle）に応じて、
 * 背景塗りつぶし（FILL）か背景なし+左のドット表示（DOT）かを判定する。
 */
import { useUserStore } from '@/stores/user.js';
import { getEventColorStyle } from '@/services/google-calendar-colors.js';

/**
 * イベントバーをドット表示にするかどうか
 * @param {HandyCalendarEvent} evt イベント情報
 * @returns {boolean}
 */
export function isDotEventBar(evt) {
  const userStore = useUserStore();
  return (evt.isAllDay ? userStore.allDayEventBarStyle : userStore.timedEventBarStyle) === 'DOT';
}

/**
 * イベントバーのインラインスタイルを返す。
 * ドット表示のときは背景・文字色の指定を外し（CSS 側で透過背景＋通常文字色）、
 * 塗りつぶし表示のときは従来のイベント配色を返す。
 * @param {HandyCalendarEvent} evt イベント情報
 * @returns {Record<string, string>}
 */
export function getEventBarStyle(evt) {
  if (isDotEventBar(evt)) return {};
  return getEventColorStyle(evt);
}

/**
 * ドット表示のときに左側へ表示する丸の色（イベント色、なければカレンダー色）
 * @param {HandyCalendarEvent} evt イベント情報
 * @returns {string}
 */
export function getEventDotColor(evt) {
  return getEventColorStyle(evt).backgroundColor;
}
