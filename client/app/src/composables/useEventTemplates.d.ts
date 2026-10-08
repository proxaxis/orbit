declare global {
  /**
   * イベントテンプレートに保持するイベント情報（日時を除く）。
   */
  interface OrbitEventTemplateEvent {
    /** イベントタイトル */
    summary: string;
    /** イベントの説明 */
    description: string;
    /** 場所 */
    location: string;
    /** 個人用ノート */
    privacyNote: string;
    /** 保存先カレンダー ID */
    calendarId: string;
    /** アイコン絵文字 */
    icon: string;
    /** 終日イベントかどうか */
    isAllDay: boolean;
    /** イベントの所要時間（分）。終日イベントも分で保持する */
    durationMinutes: number;
    /** タイムゾーン */
    timeZone: string;
    /** 招待先メールアドレスと表示名 */
    attendees: { email: string; displayName?: string }[];
    /** 通知設定（入力行の {value, unit} 形式） */
    reminders: { value: number; unit: 'minute' | 'hour' | 'day' }[];
    /** popup 以外（email など）のリマインダー上書き */
    preservedReminderOverrides: { method: string; minutes: number }[];
    /** 繰り返し設定（フォームの入力形式そのまま） */
    recurrence: {
      frequency: string;
      interval: number;
      weekdays: string[];
      monthDay: string;
      month: string;
      count: string;
      until: string;
      exclusions: string;
      holidayAdjustment: string;
    };
    /** 写真共有アルバムを作成するか */
    createPhotoAlbum: boolean;
    /** イベント個別のカラー ID（'' はカレンダーの色を使う） */
    eventColorId: string;
    /** イベントタグ（extendedProperties.shared に保存され description 末尾にも #tag で付与される） */
    tags?: string[];
  }

  /**
   * ユーザが保存したイベントのひな型。
   */
  interface OrbitEventTemplate {
    /** テンプレート ID */
    id: string;
    /** テンプレート名 */
    name: string;
    /** テンプレートの説明 */
    description: string;
    /** 作成日時（UNIX ミリ秒） */
    createdAt: number;
    /** イベント情報 */
    event: OrbitEventTemplateEvent;
  }
}

export {};
