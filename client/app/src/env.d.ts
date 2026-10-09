import type { Ref as _Ref, ComputedRef as _ComputedRef, ShallowRef as _ShallowRef, Watch as _Watch } from 'vue';

declare global {
  /**
   * ==========================================================================
   * 1. Vue & ユーティリティ型定義
   * ==========================================================================
   */
  type Ref<T> = _Ref<T>;
  type ComputedRef<T> = _ComputedRef<T>;
  type ShallowRef<T> = _ShallowRef<T>;
  type Watch = _Watch;
  type Dayjs = import('dayjs').Dayjs;
  type GoogleCalendarEventColorId = import('./services/google-calendar-colors.d.ts').GoogleCalendarEventColorId;
  type GoogleCalendarListColorId = import('./services/google-calendar-colors.d.ts').GoogleCalendarListColorId;

  /**
   * ==========================================================================
   * 2. 環境変数型定義 (Vite)
   * @see https://vitejs.dev/guide/env-and-mode.html
   * ==========================================================================
   */
  interface ImportMetaEnv {
    readonly BASE_URL?: string;
    readonly VITE_BFF_BASE_URL?: string;
    readonly VITE_VAPID_PUBLIC_KEY?: string;
    readonly VITE_GOOGLE_CALENDAR_API_BASE_URL?: string;
    readonly VITE_GOOGLE_PEOPLE_API_BASE_URL?: string;
    readonly VITE_GOOGLE_PHOTOS_LIBRARY_API_BASE_URL?: string;
    readonly VITE_GOOGLE_PHOTOS_PICKER_API_BASE_URL?: string;
    [key: string]: any;
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }

  /**
   * ==========================================================================
   * 3. フロントエンド共通モデル
   * ==========================================================================
   */
  interface HandyCalendarEvent {
    id: string;
    calendarId: string;
    timeZone?: IanaTimeZone;
    description?: string;
    summary: string;
    startDateTime: Dayjs;
    endDateTime: Dayjs;
    isAllDay: boolean;
    icon?: string;
    eventColorId?: string;
    calendarColorId?: string;
    calendarBackgroundColor?: string;
    calendarForegroundColor?: string;
    location?: string;
    /** イベントに付与されたタグ（extendedProperties.shared 由来。description 末尾の #tag とは別に保持） */
    tags?: string[];
    raw: GoogleCalendarEvent;
  }
}

export {};
