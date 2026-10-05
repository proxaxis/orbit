/**
 * ============================================================================
 * Google Calendar API Color ID 型定義
 * @see https://developers.google.com/calendar/api/v3/reference/colors
 * ============================================================================
 */

// ----------------------------------------------------------------------------
// 1. イベント用 ColorId (1 〜 11)
// ----------------------------------------------------------------------------

/**
 * イベント (Event) の colorId
 * 1: ラベンダー (Lavender)
 * 2: セージ (Sage)
 * 3: ブドウ (Grape)
 * 4: フラミンゴ (Flamingo)
 * 5: バナナ (Banana)
 * 6: みかん (Tangerine)
 * 7: ピーコック (Peacock)
 * 8: グラファイト (Graphite)
 * 9: ブルーベリー (Blueberry)
 * 10: バジル (Basil)
 * 11: トマト (Tomato)
 */
export type GoogleCalendarEventColorId = '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | '11';

// ----------------------------------------------------------------------------
// 2. カレンダーリスト用 ColorId (1 〜 24)
// ----------------------------------------------------------------------------

/**
 * カレンダー (CalendarListEntry) の colorId
 * 1 〜 24 の計24色
 */
export type GoogleCalendarListColorId = '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | '11' | '12' | '13' | '14' | '15' | '16' | '17' | '18' | '19' | '20' | '21' | '22' | '23' | '24';

/**
 * すべての Google Calendar ColorId の総合ユニオン型
 */
export type GoogleCalendarColorId = GoogleCalendarEventColorId | GoogleCalendarListColorId;

// ----------------------------------------------------------------------------
// 3. カラーパレット定数定義（背景色・文字色・標準ラベル名）
// ----------------------------------------------------------------------------

export interface GoogleCalendarColorInfo {
  readonly name: string;
  readonly background: string;
  readonly foreground: string;
}

/** カレンダーリストの Color ID から色情報を取得します。 */
export function getCalendarListColorInfoById(colorId: GoogleCalendarListColorId): GoogleCalendarColorInfo | undefined;

/** カレンダーリストの色情報から Color ID を取得します。 */
export function getCalendarListColorIdByColor(color: string): GoogleCalendarListColorId | undefined;

/** イベントの Color ID から色情報を取得します。 */
export function getCalendarEventColorInfoById(colorId: GoogleCalendarEventColorId): GoogleCalendarColorInfo | undefined;
