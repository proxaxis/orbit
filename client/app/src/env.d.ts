import type { Ref as _Ref, ComputedRef as _ComputedRef, ShallowRef as _ShallowRef, Watch as _Watch } from 'vue';

declare global {
  /**
   * Vue 関連の型定義
   */

  type Ref<T> = _Ref<T>;
  type ComputedRef<T> = _ComputedRef<T>;
  type ShallowRef<T> = _ShallowRef<T>;
  type Watch = _Watch;
  
  /**
   * 環境変数関連の型定義 - Vite で定義された環境変数は import.meta.env.* で格納される
   * @see https://vitejs.dev/guide/env-and-mode.html
   */

  interface ImportMeta {
    readonly env: {
      readonly BASE_URL?: string|undefined;
      readonly VITE_BFF_BASE_URL?: string|undefined;
      readonly VITE_GOOGLE_CALENDAR_API_BASE_URL?: string|undefined;
    };
  }

  /**
   * Google Calendar API 関連の型定義
   * @see https://developers.google.com/calendar/api/v3/reference/events
   */

  /** RFC3339 形式の UTC ベース日時タイムスタンプ文字列（例: 2026-09-30T10:04:04Z）*/
  type DateTimeString = string;

  /** タイムゾーンオフセット付きの RFC3339 形式の日時タイムスタンプ文字列（例: 2026-09-30T18:00:00+09:00）*/
  type DateTimeStringWithTimezone = string;

  /** タイムゾーン文字列（例: Asia/Tokyo）*/
  type TimeZoneString = string;

  /** イベントの開始日時と終了日時 */
  interface EventDateTime {
    /** 終日イベントの場合の日付（形式: YYYY-MM-DD） */
    date?: string;
    /** 通常イベントの日時（例: 2026-09-30T18:00:00+09:00、timeZone が指定されていない限り、タイムゾーンオフセットが必要） */
    dateTime?: DateTimeString;
    /** タイムゾーン */
    timeZone?: TimeZoneString;
  }

  /** イベントの参加者 */
  interface EventAttendee {
    /** 参加者のプロフィール ID */
    id?: string;
    /** 参加者のメールアドレス */
    email?: string;
    /** 参加者の名前 */
    displayName?: string;
    /** 参加者が主催者かどうか（デフォルト: false） */
    readonly organizer: boolean;
    /** このエントリが、このイベントのコピーが表示されるカレンダーを表すかどうか（デフォルト: false） */
    self: boolean;
    /** 参加者がリソースかどうか（参加者が初めて予定に追加されたときにのみ設定でき、後続の変更は無視される）*/
    resource?: boolean;
    /** この参加者がオプションの参加者かどうか（デフォルト: false） */
    optional: boolean;
    /** 出席者の返信ステータス */
    responseStatus: 'needsAction' | 'declined' | 'tentative' | 'accepted';
    /** 参加者のコメント */
    comment?: string;
    /** 追加のゲスト数（デフォルト: 0） */
    additionalGuests: number;
  }

  /** イベントにコミットしたユーザ */
  interface EventCommitter {
    /** コミッタのプロフィール ID */
    id?: string;
    /** コミッタのメールアドレス */
    email?: string;
    /** コミッタの名前 */
    displayName?: string;
    /** コミッタがこのイベントのコピーが表示されるカレンダーに対応しているかどうか（デフォルト: false） */
    self: boolean;
  }

  /** リマインダーの設定 */
  interface ReminderConfiguration {
    /** このリマインダーで使用されるメソッド */
    method: 'email' | 'popup';
    /** リマインダーをトリガーする予定の開始時刻の何分前か（形式: 0~40320、4週間を分単位で指定）*/
    minutes: number;
  }

  /** Google Calendar Event の型定義 @see https://developers.google.com/calendar/api/v3/reference/events */
  interface GoogleEvent {
    /** イベントの不透明な識別子 */
    id: string;
    /** イベントのタイトル */
    summary: string;
    /** イベントの詳細説明（HTML を含めることができる） */
    description?: string;
    /** イベントの地理的位置（自由形式のテキスト） */
    location?: string;
    /** イベントのステータス */
    status: 'confirmed' | 'tentative' | 'cancelled';
    /** ウェブ UI におけるこの予定への絶対リンク */
    readonly htmlLink?: string;
    /** イベントの作成日時 */
    readonly created: DateTimeString;
    /** イベントの最終更新日時 */
    readonly updated: DateTimeString;
    /** イベントの開始日時 */
    start: EventDateTime;
    /** イベントの終了日時 */
    end: EventDateTime;
    /** イベントの参加者 */
    attendees?: EventAttendee[];
    /** イベントに関連付けられているハングアウトへの絶対リンク */
    hangoutLink?: string;
    /** イベントの色 ID @see https://developers.google.com/calendar/v3/reference/colors */
    colorId: string;
    /** イベントの作成者 */
    creator: EventCommitter;
    /** イベントの主催者 */
    organizer: EventCommitter;
    /** イベントの繰り返しパターン（形式: RFC5545） */
    recurrence?: [string];
    /** 定期的な予定のインスタンスの場合、これはこのインスタンスが属する定期的な予定の ID */
    readonly recurringEventId?: string;
    /** 定期的な予定のインスタンスの場合、これは recurringEventId で識別される定期的な予定の繰り返しデータに従って、この予定が開始される時刻 */
    originalStartTime?: EventDateTime;
    /** 予定がカレンダーの時間をブロックするかどうか */
    transparency?: 'opaque' | 'transparent';
    /** イベントの公開設定（デフォルト: default）*/
    visibility: 'default' | 'public' | 'private';
    /** イベントの固有識別子（形式: RFC5545）*/
    iCalUID: string;
    /** iCalendar に準拠したシーケンス番号 */
    sequence: integer;
    /** 予定の表現から出席者が省略されているかどうか（デフォルト: false）*/
    attendeesOmitted: boolean;
    /** イベントの拡張プロパティ */
    extendedProperties: {
      /** 非公開プロパティ */
      private: {
        (key): string;
      };
      /** 共有プロパティ */
      shared: {
        (key): string;
      };
    };
    /** 主催者以外の参加者が他のユーザーを予定に招待できるかどうか（デフォルト: true）*/
    guestsCanInviteOthers?: boolean;
    /** 主催者以外の参加者が予定を変更できるかどうか（デフォルト: false）*/
    guestsCanModify?: boolean;
    /** 主催者以外の参加者が、イベントの参加者を確認できるかどうか（デフォルト: true）*/
    guestsCanSeeOtherGuests?: boolean;
    /** イベントがロックされているかどうか（デフォルト: false）*/
    readonly locked: boolean;
    /** 認証済みユーザーのイベントのリマインダーに関する情報 */
    readonly reminders: {
      /** カレンダーのデフォルトのリマインダーが予定に適用されるかどうか */
      useDefault: boolean;
      /** 予定でデフォルトのリマインダーを使用していない場合は、予定に固有のリマインダーが一覧表示される */
      overrides: ReminderConfiguration[];
    };
    /** イベントの添付ファイル */
    attachments: [
      {
        /** 添付ファイルへの URL リンク */
        fileUrl: string;
        /** 添付ファイルのタイトル */
        title: string;
        /** 添付ファイルのインターネットメディアタイプ（MIME タイプ）*/
        mimeType: string;
        /** 添付ファイルのアイコンへの URL リンク（カスタムのサードパーティ製添付ファイルに対してのみ変更可能）*/
        iconLink: string;
        /** 添付ファイルの ID（Google ドライブファイルの場合、Drive API の対応する Files リソースエントリの ID を指定） */
        fileId: string;
      },
    ];
    /** 誕生日や特別なイベントのデータ */
    birthdayProperties: {
      /** この誕生日イベントがリンクされている連絡先のリソース名（形式: people/c12345、People API から取得可能）*/
      readonly contact: string;
      /** 誕生日や特別なイベントの種類 */
      type: 'birthday' | 'anniversary' | 'custom' | 'other' | 'self';
      /** このイベントに指定されたカスタムタイプのラベル（type が custom の場合に適用）*/
      customTypeName: string;
    };
    eventType: string;

    [key: string]: any; // 他の拡張フィールドのアクセスを許容する場合
  }

  /** イベント一覧取得 API（GET /events） のレスポンス型 */
  interface EventsListResponse {
    /** カレンダーのタイトル */
    readonly summary?: string;
    readonly description?: string;
    readonly updated?: DateTimeString;
    /** タイムゾーン */
    readonly timeZone?: TimeZoneString;
    /** このカレンダーに対するユーザのアクセス権限 */
    readonly accessRole?: 'none' | 'freeBusyReader' | 'reader' | 'writerWithoutPrivateAccess' | 'writer' | 'owner';
    /** このカレンダーのデフォルトのリマインダー設定 */
    readonly defaultReminders?: ReminderConfiguration[];
    /** この結果の次のページにアクセスするために使用されるトークン */
    readonly nextPageToken?: string;
    /** この結果が返されてから変更されたエントリのみを取得するために、後で使用されるトークン */
    readonly nextSyncToken?: string;
    /** イベントリスト */
    items?: GoogleEvent[];
  }

  // ==========================================
  // 4. events.list のクエリパラメータ型
  // ==========================================

  interface EventsListQueryParams {
    /** 取得開始日時（ISO 8601 文字列） */
    timeMin?: string;
    /** 取得終了日時（ISO 8601 文字列） */
    timeMax?: string;
    /** タイムゾーン */
    timeZone?: TimeZoneString;
    /** 繰り返し予定を展開して個別のイベントとして返すか（通常は true 推奨） */
    singleEvents?: boolean;
    /** ソート順（singleEvents: true の場合のみ 'startTime' 指定可能） */
    orderBy?: 'startTime' | 'updated';
    /** 1ページあたりの最大取得件数（最大 2500, デフォルト 250） */
    maxResults?: number;
    /** 次ページ取得トークン */
    pageToken?: string;
    /** 差分同期用トークン */
    syncToken?: string;
    /** 削除されたイベントも含めるか（差分同期時に重要） */
    showDeleted?: boolean;
    /** 検索キーワード（イベントの要約・詳細・場所・出席者などを部分一致検索） */
    q?: string;
  }

  // ==========================================
  // 5. Google API エラーレスポンス型
  // ==========================================

  interface GoogleApiErrorDetail {
    message: string;
    domain: string;
    reason: string; // 'authError', 'rateLimitExceeded', 'notFound', 'fullSyncRequired' など
    location?: string;
    locationType?: string;
  }

  interface GoogleApiErrorResponse {
    error: {
      code: number;
      message: string;
      errors: GoogleApiErrorDetail[];
      status?: string;
    };
  }

  // ==========================================
  // 6. カレンダーの色情報（GET /colors のレスポンス）
  // ==========================================

  interface CalendarColorDefinition {
    background: string;
    foreground: string;
  }

  interface ColorsResponse {
    kind: 'calendar#colors';
    updated: string;
    calendar: Record<string, CalendarColorDefinition>;
    event: Record<string, CalendarColorDefinition>; // colorId（1〜11） のカラーパレット
  }

  // ==========================================
  // カレンダーメタデータ & リスト
  // ==========================================

  interface GoogleCalendarListEntry {
    kind: 'calendar#calendarListEntry';
    /** カレンダーの識別子 */
    id: string;
    /** カレンダーのタイトル */
    readonly summary: string;
    /** カレンダーの説明 */
    readonly description?: string;
    /** カレンダーの地理的位置（自由形式のテキスト）*/
    readonly location?: string;
    /** カレンダーのタイムゾーン */
    readonly timeZone?: TimeZoneString;
    /** カレンダーのオーナーのメールアドレス（予備カレンダーにのみ設定）*/
    readonly dataOwner?: string;
    /** カレンダーの色 */
    colorId?: string;
    /** カレンダーの背景色（例: #ffffff）*/
    backgroundColor?: string;
    /** カレンダーの前景色（例: #000000）*/
    foregroundColor?: string;
    /** カレンダーがリストから非表示になっているかどうか */
    hidden?: boolean;
    /** カレンダーのコンテンツがカレンダー UI に表示されるかどうか（デフォルト: false）*/
    selected?: boolean;
    /** 認証されたユーザーがカレンダーに対して持っている有効なアクセスロール */
    readonly accessRole: 'freeBusyReader' | 'reader' | 'writerWithoutPrivateAccess' | 'writer' | 'owner';
    /** カレンダーのデフォルトのリマインダー */
    defaultReminders: ReminderConfiguration[];
    /** カレンダーがメインカレンダーかどうか（デフォルト: false）*/
    readonly primary?: boolean;
    /** このカレンダーリストエントリがカレンダーリストから削除されたかどうか（デフォルト: false）*/
    readonly deleted?: boolean;
    /** このカレンダーで招待を自動的に受け入れるかどうか（リソースカレンダーでのみ有効）*/
    readonly autoAcceptInvitations: boolean;
  }

  interface CalendarListResponse {
    kind: 'calendar#calendarList';
    etag: string;
    nextPageToken?: string;
    nextSyncToken?: string;
    items: GoogleCalendarListEntry[];
  }

  // ==========================================
  // 空き時間取得（POST /freeBusy）
  // ==========================================

  interface FreeBusyRequest {
    timeMin: string; // ISO 8601
    timeMax: string; // ISO 8601
    timeZone?: string;
    items: { id: string }[]; // 調査対象のカレンダーID配列 [{ id: 'primary' }]
  }

  interface TimePeriod {
    start: string; // ISO 8601
    end: string; // ISO 8601
  }

  interface FreeBusyCalendar {
    errors?: { domain: string; reason: string }[];
    busy: TimePeriod[]; // 予定が詰まっている時間帯
  }

  interface FreeBusyResponse {
    kind: 'calendar#freeBusy';
    timeMin: string;
    timeMax: string;
    calendars: Record<string, FreeBusyCalendar>;
  }

  // ==========================================
  // 会議データ（Conference Data）
  // ==========================================

  interface ConferenceSolutionKey {
    type: 'hangoutsMeet' | 'eventHangout' | 'eventNamedHangout';
  }

  interface CreateConferenceRequest {
    requestId: string; // ユニークなランダム文字列（リクエストの重複防止用）
    conferenceSolutionKey: ConferenceSolutionKey;
  }

  interface EntryPoint {
    entryPointType: 'video' | 'phone' | 'sip' | 'more';
    uri: string; // Meet の URL（https://meet.google.com/xxx-xxxx-xxx）
    label?: string;
    pin?: string;
  }

  interface ConferenceData {
    createRequest?: CreateConferenceRequest;
    entryPoints?: EntryPoint[];
    conferenceSolution?: {
      key: ConferenceSolutionKey;
      name: string;
      iconUri: string;
    };
    conferenceId?: string;
    signature?: string;
  }

  // ==========================================
  // 拡張プロパティ（アプリ固有のデータを保存）
  // ==========================================

  interface ExtendedProperties {
    /** アプリ専用のプライベートプロパティ（他のアプリからは不可視） */
    private?: Record<string, string>;
    /** 共有プロパティ（他のアプリやユーザーからも可視） */
    shared?: Record<string, string>;
  }

  // ==========================================
  // フロントエンド UI 表示用（Formatted Event）
  // ==========================================

  interface UiCalendarEvent {
    id: string;
    title: string;
    startDate: Date;
    endDate: Date;
    isAllDay: boolean;
    color?: string;
    location?: string;
    meetUrl?: string;
    raw: CalendarEvent; // 元データも保持
  }
}
