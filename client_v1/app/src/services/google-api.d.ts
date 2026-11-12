/**
 * Google API 共通の日時・文字列・エラー型定義。
 * Calendar / People / Photos の各 API サービスで共有する。
 */
declare global {
  type GoogleApiDateTimeString = string;

  /** 終日イベント用日付文字列（形式: YYYY-MM-DD） */
  type GoogleApiDateString = string;

  /** IANA タイムゾーン識別子文字列（例: 'Asia/Tokyo', 'UTC'） */
  type IanaTimeZone = string;

  /** API エラーレスポンス */
  interface GoogleApiErrorDetail {
    message: string;
    domain: string;
    reason: string;
    location?: string;
    locationType?: string;
  }

  interface GoogleApiErrorResponse {
    error: {
      code: number;
      message: string;
      errors?: GoogleApiErrorDetail[];
      status?: string;
    };
  }
}
export {};
