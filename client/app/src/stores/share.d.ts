/**
 * 期間指定共有機能の型定義（stores/share.js / composables/useShare.js で使用）。
 */
declare global {
  /** 期間を指定した共有の条件（コピーカレンダー経由の共有） */
  interface OrbitShareSpec {
    /** 共有の一意な ID */
    id: string;
    /** 共有カレンダーの表示名 */
    title: string;
    /** 共有相手のメールアドレス */
    recipient: string;
    /** コピー元カレンダー ID の一覧 */
    calendarIds: string[];
    /** 共有範囲の開始日（YYYY-MM-DD） */
    rangeStart: string;
    /** 共有範囲の終了日（YYYY-MM-DD、当日を含む） */
    rangeEnd: string;
    /** 共有の有効期限（YYYY-MM-DD、当日を含む） */
    expiresAt: string;
    /** 共有相手の権限 */
    role: 'freeBusyReader' | 'reader';
    /** 作成したコピーカレンダーの ID */
    copyCalendarId: string | null;
    /** 共有相手に付与した ACL ルール ID */
    aclRuleId: string | null;
    /** 作成日時（ISO 文字列） */
    createdAt: string;
    /** 最後にコピー同期を行った日時 */
    lastSyncedAt: string | null;
  }
}
export {};
