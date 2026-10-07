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
   * 3. Google Calendar API 共通日時・文字列型
   * ==========================================================================
   */

  /** RFC3339 形式の日時文字列（UTC: '2026-10-01T10:00:00Z' / オフセット付: '2026-10-01T19:00:00+09:00'） */
  type GoogleApiDateTimeString = string;

  /** 終日イベント用日付文字列（形式: YYYY-MM-DD） */
  type GoogleApiDateString = string;

  /** IANA タイムゾーン識別子文字列（例: 'Asia/Tokyo', 'UTC'） */
  type IanaTimeZone = string;

  /**
   * ==========================================================================
   * 4. Google Calendar Event 関連コンポーネント型
   * @see https://developers.google.com/calendar/api/v3/reference/events
   * ==========================================================================
   */

  /** イベントの開始日時・終了日時情報 */
  interface GoogleCalendarEventDateTime {
    /** 終日イベントの場合の日付（形式: YYYY-MM-DD）。dateTime と排他 */
    date?: GoogleApiDateString;
    /** 通常イベントの開始/終了日時（RFC3339 形式）。date と排他 */
    dateTime?: GoogleApiDateTimeString;
    /** タイムゾーン名（例: 'Asia/Tokyo'） */
    timeZone?: IanaTimeZone;
  }

  /** イベント出席者の参加ステータス */
  type GoogleCalendarAttendeeResponseStatus = 'needsAction' | 'declined' | 'tentative' | 'accepted';

  /** イベント出席者 */
  interface GoogleCalendarAttendee {
    /** 出席者のプロフィール ID */
    id?: string;
    /** 出席者のメールアドレス */
    email?: string;
    /** 出席者の表示名 */
    displayName?: string;
    /** 主催者かどうか（デフォルト: false） */
    organizer?: boolean;
    /** 実行ユーザ自身のカレンダーに対応するエントリかどうか */
    self?: boolean;
    /** 会議室や備品などのリソースかどうか */
    resource?: boolean;
    /** 任意参加（オプショナル）かどうか */
    optional?: boolean;
    /** 返答ステータス */
    responseStatus?: GoogleCalendarAttendeeResponseStatus;
    /** 出席者のコメント */
    comment?: string;
    /** 同伴ゲスト数 */
    additionalGuests?: number;
  }

  /** イベント作成者・主催者情報 */
  interface GoogleCalendarOrganizer {
    /** ユーザーのプロフィール ID */
    id?: string;
    /** メールアドレス */
    email?: string;
    /** 表示名 */
    displayName?: string;
    /** 実行ユーザー自身かどうか */
    self?: boolean;
  }

  /** リマインダー設定の通知方式 */
  type GoogleCalendarReminderMethod = 'email' | 'popup';

  /** 個別リマインダー設定 */
  interface GoogleCalendarReminderOverride {
    method: GoogleCalendarReminderMethod;
    /** 開始時刻の何分前に通知するか (0〜40320: 4週間以内) */
    minutes: number;
  }

  /** イベントに添付されたファイル情報 */
  interface GoogleCalendarAttachment {
    /** ファイルへの URL リンク */
    fileUrl: string;
    /** タイトル */
    title: string;
    /** MIME タイプ */
    mimeType: string;
    /** ファイルのアイコン画像 URL */
    iconLink?: string;
    /** Google Drive の File ID */
    fileId?: string;
  }

  /** イベントの種類 */
  type GoogleCalendarEventType = 'default' | 'outOfOffice' | 'focusTime' | 'workingLocation' | 'birthday';

  /** 不在（Out of Office）設定プロパティ */
  interface GoogleCalendarOutOfOfficeProperties {
    autoDeclineMode?: 'declineNone' | 'declineAll' | 'declineOnlyNew';
    declineMessage?: string;
  }

  /** 集中時間（Focus Time）プロパティ */
  interface GoogleCalendarFocusTimeProperties {
    autoDeclineMode?: 'declineNone' | 'declineAll' | 'declineOnlyNew';
    declineMessage?: string;
    chatStatus?: string;
  }

  /** 勤務場所（Working Location）プロパティ */
  interface GoogleCalendarWorkingLocationProperties {
    type?: 'homeOffice' | 'officeLocation' | 'customLocation';
    homeOffice?: any;
    customLocation?: {
      label?: string;
    };
    officeLocation?: {
      buildingId?: string;
      floorId?: string;
      floorSectionId?: string;
      deskId?: string;
      label?: string;
    };
  }

  /** 誕生日・記念日プロパティ */
  interface GoogleCalendarBirthdayProperties {
    /** 紐づく People API のリソース名（形式: people/c12345） */
    readonly contact?: string;
    /** イベントの種別 */
    type: 'birthday' | 'anniversary' | 'custom' | 'other' | 'self';
    /** type が 'custom' の場合のラベル名 */
    customTypeName?: string;
  }

  /** 会議（Google Meet 等）ソリューションの種類 */
  type GoogleCalendarConferenceSolutionType = 'hangoutsMeet' | 'eventHangout' | 'eventNamedHangout';

  interface GoogleCalendarConferenceSolutionKey {
    type: GoogleCalendarConferenceSolutionType;
  }

  interface GoogleCalendarCreateConferenceRequest {
    /** 重複防止用の一意なリクエストID */
    requestId: string;
    conferenceSolutionKey: GoogleCalendarConferenceSolutionKey;
    status?: {
      statusCode: 'pending' | 'success' | 'failure';
    };
  }

  interface GoogleCalendarEntryPoint {
    entryPointType: 'video' | 'phone' | 'sip' | 'more';
    uri: string;
    label?: string;
    pin?: string;
    accessCode?: string;
    meetingCode?: string;
    passcode?: string;
    password?: string;
  }

  /** 会議連携データ（Google Meet 等） */
  interface GoogleCalendarConferenceData {
    createRequest?: GoogleCalendarCreateConferenceRequest;
    entryPoints?: GoogleCalendarEntryPoint[];
    conferenceSolution?: {
      key: GoogleCalendarConferenceSolutionKey;
      name: string;
      iconUri: string;
    };
    conferenceId?: string;
    signature?: string;
    notes?: string;
  }

  /** アプリケーション拡張プロパティ */
  interface GoogleCalendarExtendedProperties {
    /** アプリ専用のプライベートプロパティ（他クライアントから不可視） */
    private?: Record<string, string>;
    /** 共有プロパティ（他のアプリや閲覧者からも可視） */
    shared?: Record<string, string>;
  }

  /**
   * Google Calendar Event リソース
   * @see https://developers.google.com/calendar/api/v3/reference/events#resource
   */
  interface GoogleCalendarEvent {
    kind?: 'calendar#event';
    etag?: string;
    /** イベントの一意な ID */
    id?: string;
    /** イベントのタイトル */
    summary?: string;
    /** イベントの説明（HTML 可） */
    description?: string;
    /** 開催場所 */
    location?: string;
    /** イベントのステータス */
    status?: 'confirmed' | 'tentative' | 'cancelled';
    /** Web 版 Google カレンダーへのリンク */
    readonly htmlLink?: string;
    /** 作成日時 */
    readonly created?: GoogleApiDateTimeString;
    /** 最終更新日時 */
    readonly updated?: GoogleApiDateTimeString;
    /** 開始日時（終日または時刻指定） */
    start?: GoogleCalendarEventDateTime;
    /** 終了日時（終日または時刻指定） */
    end?: GoogleCalendarEventDateTime;
    /** 出席者リスト */
    attendees?: GoogleCalendarAttendee[];
    /** Google Meet などのビデオ会議 URL */
    hangoutLink?: string;
    /** 会議接続データ詳細 */
    conferenceData?: GoogleCalendarConferenceData;
    /** カラーパレット ID ('1'〜'11') */
    colorId?: GoogleCalendarEventColorId;
    /** 作成者 */
    creator?: GoogleCalendarOrganizer;
    /** 主催者 */
    organizer?: GoogleCalendarOrganizer;
    /** 繰り返しルール（RFC5545 RRULE 形式の文字列配列） */
    recurrence?: string[];
    /** 繰り返し親イベントの ID */
    readonly recurringEventId?: string;
    /** 繰り返しインスタンスの元の開始予定時刻 */
    originalStartTime?: GoogleCalendarEventDateTime;
    /** 空き時間ブロック設定（'opaque': 予定あり / 'transparent': 空き時間） */
    transparency?: 'opaque' | 'transparent';
    /** 公開範囲 */
    visibility?: 'default' | 'public' | 'private' | 'confidential';
    /** iCalendar UID (RFC5545) */
    iCalUID?: string;
    /** シーケンス番号（整数） */
    sequence?: number;
    /** 出席者情報が省略されているかどうか */
    attendeesOmitted?: boolean;
    /** 拡張プロパティ */
    extendedProperties?: GoogleCalendarExtendedProperties;
    /** ゲストによる他の人の招待可否 */
    guestsCanInviteOthers?: boolean;
    /** ゲストによる予定変更可否 */
    guestsCanModify?: boolean;
    /** ゲストによる他の参加者の確認可否 */
    guestsCanSeeOtherGuests?: boolean;
    /** 予定がロックされているか */
    readonly locked?: boolean;
    /** リマインダー設定 */
    reminders?: {
      useDefault: boolean;
      overrides?: GoogleCalendarReminderOverride[];
    };
    /** 添付ファイル一覧 */
    attachments?: GoogleCalendarAttachment[];
    /** イベントの分類・特殊種別 */
    eventType?: GoogleCalendarEventType;
    /** 各イベント種別に応じた詳細プロパティ */
    outOfOfficeProperties?: GoogleCalendarOutOfOfficeProperties;
    focusTimeProperties?: GoogleCalendarFocusTimeProperties;
    workingLocationProperties?: GoogleCalendarWorkingLocationProperties;
    birthdayProperties?: GoogleCalendarBirthdayProperties;

    [key: string]: any;
  }

  /**
   * ==========================================================================
   * 5. Calendar & CalendarList リソース
   * @see https://developers.google.com/calendar/api/v3/reference/calendarList
   * @see https://developers.google.com/calendar/api/v3/reference/calendars
   * ==========================================================================
   */

  /** ユーザーのアクセス権限ロール */
  type GoogleCalendarAccessRole = 'none' | 'freeBusyReader' | 'reader' | 'writerWithoutPrivateAccess' | 'writer' | 'owner';

  /** カレンダーエントリ（左ペインに表示されるカレンダー一覧の要素） */
  interface GoogleCalendarListEntry {
    kind: 'calendar#calendarListEntry';
    etag: string;
    id: string;
    readonly summary: string;
    summaryOverride?: string;
    readonly description?: string;
    readonly location?: string;
    readonly timeZone?: IanaTimeZone;
    colorId?: GoogleCalendarListColorId;
    backgroundColor?: string;
    foregroundColor?: string;
    hidden?: boolean;
    selected?: boolean;
    readonly accessRole: GoogleCalendarAccessRole;
    defaultReminders?: GoogleCalendarReminderOverride[];
    readonly primary?: boolean;
    readonly deleted?: boolean;
    readonly autoAcceptInvitations?: boolean;
  }

  /** カレンダーメタデータリソース（個別カレンダーそのものの情報） */
  interface GoogleCalendarResource {
    kind: 'calendar#calendar';
    etag: string;
    id: string;
    summary: string;
    description?: string;
    location?: string;
    timeZone?: IanaTimeZone;
    conferenceProperties?: {
      allowedConferenceSolutionTypes?: GoogleCalendarConferenceSolutionType[];
    };
    dataOwner?: string;
  }

  /** カレンダー共有ルールの対象範囲 */
  interface GoogleCalendarAclScope {
    type: 'default' | 'user' | 'group' | 'domain';
    value?: string;
  }

  /** カレンダー共有ルール */
  interface GoogleCalendarAclRule {
    kind: 'calendar#aclRule';
    id: string;
    role: 'none' | 'freeBusyReader' | 'reader' | 'writer' | 'owner';
    scope: GoogleCalendarAclScope;
  }

  /** ACL 一覧レスポンス */
  interface GoogleCalendarAclResponse {
    kind: 'calendar#acl';
    etag?: string;
    nextPageToken?: string;
    nextSyncToken?: string;
    items?: GoogleCalendarAclRule[];
  }

  /**
   * ==========================================================================
   * 6. API リクエスト / レスポンス型
   * ==========================================================================
   */

  /** events.list クエリパラメータ */
  interface GoogleCalendarEventsListQueryParams {
    /** 取得下限日時（RFC3339 文字列） */
    timeMin?: GoogleApiDateTimeString;
    /** 取得上限日時（RFC3339 文字列） */
    timeMax?: GoogleApiDateTimeString;
    /** タイムゾーン */
    timeZone?: IanaTimeZone;
    /** 定期イベントを個々のインスタンスに展開するか（通常 true） */
    singleEvents?: boolean;
    /** 並び順（singleEvents=true の時のみ 'startTime' が指定可能） */
    orderBy?: 'startTime' | 'updated';
    /** 1ページあたりの取得件数（最大 2500） */
    maxResults?: number;
    /** 次ページトークン */
    pageToken?: string;
    /** 差分同期用トークン */
    syncToken?: string;
    /** キャンセル・削除済みイベントを含めるか */
    showDeleted?: boolean;
    /** 検索キーワード（部分一致） */
    q?: string;
    /** 会議データの展開バージョン（1 を推奨） */
    conferenceDataVersion?: 0 | 1;
    /** イベント種別で絞り込む場合 */
    eventTypes?: GoogleCalendarEventType[];
  }

  /** events.list レスポンス */
  interface GoogleCalendarEventsListResponse {
    kind: 'calendar#events';
    etag: string;
    summary?: string;
    description?: string;
    updated?: GoogleApiDateTimeString;
    timeZone?: IanaTimeZone;
    accessRole?: GoogleCalendarAccessRole;
    defaultReminders?: GoogleCalendarReminderOverride[];
    nextPageToken?: string;
    nextSyncToken?: string;
    items?: GoogleCalendarEvent[];
  }

  /** calendarList.list レスポンス */
  interface GoogleCalendarListResponse {
    kind: 'calendar#calendarList';
    etag: string;
    nextPageToken?: string;
    nextSyncToken?: string;
    items: GoogleCalendarListEntry[];
  }

  /** カラーパレット定義 (GET /colors) */
  interface GoogleCalendarColorDefinition {
    background: string;
    foreground: string;
  }

  interface GoogleCalendarColorsResponse {
    kind: 'calendar#colors';
    updated: string;
    calendar: Record<string, GoogleCalendarColorDefinition>;
    event: Record<string, GoogleCalendarColorDefinition>;
  }

  /** 空き時間検索 (POST /freeBusy) */
  interface GoogleCalendarFreeBusyRequest {
    timeMin: GoogleApiDateTimeString;
    timeMax: GoogleApiDateTimeString;
    timeZone?: IanaTimeZone;
    items: { id: string }[];
  }

  interface GoogleCalendarTimePeriod {
    start: GoogleApiDateTimeString;
    end: GoogleApiDateTimeString;
  }

  interface GoogleCalendarFreeBusyResponse {
    kind: 'calendar#freeBusy';
    timeMin: GoogleApiDateTimeString;
    timeMax: GoogleApiDateTimeString;
    calendars: Record<
      string,
      {
        errors?: { domain: string; reason: string }[];
        busy: GoogleCalendarTimePeriod[];
      }
    >;
  }

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

  /**
   * ==========================================================================
   * 7. フロントエンド UI 表示用（加工済みモデル）
   * ==========================================================================
   */
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
    raw: GoogleCalendarEvent;
  }

  /**
   * ==========================================================================
   * 8. Google People API (Contacts / Other Contacts) 型定義
   * @see https://developers.google.com/people/api/rest/v1/people
   * @see https://developers.google.com/people/api/rest/v1/otherContacts
   * ==========================================================================
   */

  /** Google People API 認証スコープ */
  type GooglePeopleScope = 'https://www.googleapis.com/auth/contacts' | 'https://www.googleapis.com/auth/contacts.readonly' | 'https://www.googleapis.com/auth/contacts.other.readonly';

  /** 読み取りメタデータ情報 */
  interface GooglePeopleFieldSource {
    type: 'ACCOUNT_TYPE_UNSPECIFIED' | 'PROFILE' | 'DOMAIN_PROFILE' | 'CONTACT' | 'OTHER_CONTACT' | 'DOMAIN_CONTACT';
    id?: string;
    etag?: string;
    updateTime?: GoogleApiDateTimeString;
  }

  interface GooglePeopleFieldMetadata {
    primary?: boolean;
    source?: GooglePeopleFieldSource;
    sourcePrimary?: boolean;
    verified?: boolean;
  }

  interface GooglePeoplePersonMetadata {
    sources?: GooglePeopleFieldSource[];
    objectType?: 'OBJECT_TYPE_UNSPECIFIED' | 'PERSON' | 'PAGE';
    deleted?: boolean;
    linkedPeopleResourceNames?: string[];
  }

  /** 名前情報 */
  interface GooglePeopleName {
    metadata?: GooglePeopleFieldMetadata;
    displayName?: string;
    displayNameLastFirst?: string;
    familyName?: string;
    givenName?: string;
    middleName?: string;
    honorificPrefix?: string;
    honorificSuffix?: string;
    phoneticFullName?: string;
    phoneticFamilyName?: string;
    phoneticGivenName?: string;
    phoneticMiddleName?: string;
    phoneticHonorificPrefix?: string;
    phoneticHonorificSuffix?: string;
  }

  /** メールアドレス情報 */
  interface GooglePeopleEmailAddress {
    metadata?: GooglePeopleFieldMetadata;
    value: string;
    type?: 'home' | 'work' | 'other' | string;
    formattedType?: string;
    displayName?: string;
  }

  /** 電話番号情報 */
  interface GooglePeoplePhoneNumber {
    metadata?: GooglePeopleFieldMetadata;
    value: string;
    type?: 'home' | 'work' | 'mobile' | 'homeFax' | 'workFax' | 'otherFax' | 'pager' | 'workMobile' | 'workPager' | 'main' | 'other' | string;
    formattedType?: string;
    canonicalForm?: string;
  }

  /** 写真・アバター画像 */
  interface GooglePeoplePhoto {
    metadata?: GooglePeopleFieldMetadata;
    url: string;
    default?: boolean;
  }

  /** 誕生日情報 */
  interface GooglePeopleBirthday {
    metadata?: GooglePeopleFieldMetadata;
    date?: {
      year?: number;
      month?: number;
      day?: number;
    };
    text?: string;
  }

  /** 組織・所属・肩書き */
  interface GooglePeopleOrganization {
    metadata?: GooglePeopleFieldMetadata;
    name?: string;
    department?: string;
    title?: string;
    jobDescription?: string;
    symbol?: string;
    domain?: string;
    type?: 'work' | 'school' | 'other' | string;
    formattedType?: string;
  }

  /** 住所情報 */
  interface GooglePeopleAddress {
    metadata?: GooglePeopleFieldMetadata;
    formattedValue?: string;
    type?: 'home' | 'work' | 'other' | string;
    formattedType?: string;
    poBox?: string;
    streetAddress?: string;
    extendedAddress?: string;
    city?: string;
    region?: string;
    postalCode?: string;
    country?: string;
    countryCode?: string;
  }

  /** ユーザー定義フィールド */
  interface GooglePeopleUserDefined {
    metadata?: GooglePeopleFieldMetadata;
    key: string;
    value: string;
  }

  /**
   * Google People API - Person リソース
   * (`people/c...` 形式の連絡先 または `otherContacts/...` 形式のその他の連絡先)
   */
  interface GooglePeoplePerson {
    /** リソース名（例: 'people/c1234567890' または 'otherContacts/c1234567890'） */
    resourceName: string;
    etag: string;
    metadata?: GooglePeoplePersonMetadata;
    names?: GooglePeopleName[];
    emailAddresses?: GooglePeopleEmailAddress[];
    phoneNumbers?: GooglePeoplePhoneNumber[];
    photos?: GooglePeoplePhoto[];
    birthdays?: GooglePeopleBirthday[];
    organizations?: GooglePeopleOrganization[];
    addresses?: GooglePeopleAddress[];
    userDefined?: GooglePeopleUserDefined[];
  }

  /** people.connections.list クエリパラメータ */
  interface GooglePeopleConnectionsListQueryParams {
    /** 取得対象のフィールド（カンマ区切り。例: 'names,emailAddresses,phoneNumbers,photos'） */
    personFields: string;
    pageToken?: string;
    pageSize?: number;
    orderBy?: 'LAST_MODIFIED_ASCENDING' | 'LAST_MODIFIED_DESCENDING' | 'FIRST_NAME_ASCENDING' | 'LAST_NAME_ASCENDING';
    syncToken?: string;
    requestSyncToken?: boolean;
    sources?: ('READ_SOURCE_TYPE_UNSPECIFIED' | 'READ_SOURCE_TYPE_PROFILE' | 'READ_SOURCE_TYPE_CONTACT' | 'READ_SOURCE_TYPE_DOMAIN_CONTACT')[];
  }

  /** people.connections.list レスポンス (`.../auth/contacts`) */
  interface GooglePeopleConnectionsListResponse {
    connections?: GooglePeoplePerson[];
    nextPageToken?: string;
    nextSyncToken?: string;
    totalPeople?: number;
    totalItems?: number;
  }

  /** otherContacts.list クエリパラメータ */
  interface GooglePeopleOtherContactsListQueryParams {
    /** 取得対象のフィールド（カンマ区切り。例: 'names,emailAddresses,phoneNumbers,photos'） */
    readMask: string;
    pageToken?: string;
    pageSize?: number;
    syncToken?: string;
    requestSyncToken?: boolean;
  }

  /** otherContacts.list レスポンス (`.../auth/contacts.other.readonly`) */
  interface GooglePeopleOtherContactsListResponse {
    otherContacts?: GooglePeoplePerson[];
    nextPageToken?: string;
    nextSyncToken?: string;
    totalSize?: number;
  }

  /**
   * ==========================================================================
   * 9. フロントエンド UI 表示用（連絡先モデル）
   * ==========================================================================
   */
  interface UiContact {
    resourceName: string;
    displayName: string;
    email?: string;
    phoneNumber?: string;
    photoUrl?: string;
    organization?: string;
    title?: string;
    isOtherContact: boolean;
    raw: GooglePeoplePerson;
  }

  /**
   * ==========================================================================
   * 10. Google Photos Library API / Picker API 型定義
   * @see https://developers.google.com/photos/library/reference/rest
   * @see https://developers.google.com/photos/picker/reference/rest
   * ==========================================================================
   */

  /** アルバムの共有情報 */
  interface GooglePhotosShareInfo {
    /** 共有アルバムへの参加リンク URL */
    shareableUrl?: string;
    /** 共有アルバムへの参加トークン */
    shareToken?: string;
    /** 自分がアルバムを所有しているか */
    isOwned?: boolean;
    /** アルバムに参加済みか */
    readonly isJoined?: boolean;
    /** アルバムへの参加が可能か */
    readonly isJoinable?: boolean;
  }

  /** Google Photos アルバム */
  interface GooglePhotosAlbum {
    /** アルバム ID */
    id: string;
    /** アルバムタイトル */
    title: string;
    /** Google Photos 上でアルバムを開く URL */
    productUrl?: string;
    /** アルバムに含まれるメディア数 */
    mediaItemsCount?: string;
    /** カバー写真のベース URL */
    coverPhotoBaseUrl?: string;
    /** カバー写真のメディアアイテム ID */
    coverPhotoMediaItemId?: string;
    /** アプリが書き込み可能か */
    isWriteable?: boolean;
    /** 共有情報（共有時のみ存在） */
    shareInfo?: GooglePhotosShareInfo;
  }

  /** メディアのメタデータ（写真） */
  interface GooglePhotosPhotoMetadata {
    cameraMake?: string;
    cameraModel?: string;
    focalLength?: number;
    apertureFNumber?: number;
    isoEquivalent?: number;
    exposureTime?: string;
  }

  /** メディアのメタデータ */
  interface GooglePhotosMediaMetadata {
    creationTime?: GoogleApiDateTimeString;
    width?: string;
    height?: string;
    photo?: GooglePhotosPhotoMetadata;
    video?: Record<string, any>;
  }

  /** Google Photos のメディアアイテム */
  interface GooglePhotosMediaItem {
    /** メディアアイテム ID */
    id: string;
    /** 説明文 */
    description?: string;
    /** Google Photos で開く URL */
    productUrl?: string;
    /** 画像・動画バイトの取得用ベース URL（=w幅-h高さ などのパラメータを付与して利用） */
    baseUrl?: string;
    /** MIME タイプ */
    mimeType?: string;
    /** メタデータ */
    mediaMetadata?: GooglePhotosMediaMetadata;
    /** ファイル名 */
    filename?: string;
  }

  /** アップロードトークンから生成する新規メディアアイテム */
  interface GooglePhotosNewMediaItem {
    description?: string;
    simpleMediaItem: {
      uploadToken: string;
      fileName?: string;
    };
  }

  /** mediaItems:batchCreate の個別結果 */
  interface GooglePhotosNewMediaItemResult {
    uploadToken?: string;
    status?: { code?: number; message?: string };
    mediaItem?: GooglePhotosMediaItem;
  }

  /** mediaItems:batchCreate レスポンス */
  interface GooglePhotosBatchCreateResponse {
    newMediaItemResults?: GooglePhotosNewMediaItemResult[];
  }

  /** mediaItems:search レスポンス */
  interface GooglePhotosMediaItemsSearchResponse {
    mediaItems?: GooglePhotosMediaItem[];
    nextPageToken?: string;
  }

  /** Picker API のセッション */
  interface GooglePhotosPickerSession {
    /** セッション ID */
    id: string;
    /** ユーザが写真を選ぶための Google Photos 画面 URL */
    pickerUri?: string;
    /** ポーリング設定 */
    pollingConfig?: {
      pollInterval?: string;
      timeoutIn?: string;
    };
    /** セッションの有効期限 */
    expireTime?: GoogleApiDateTimeString;
    /** 写真の選択が完了したか */
    mediaItemsSet?: boolean;
  }

  /** Picker API で選択されたメディアアイテム */
  interface GooglePhotosPickedMediaItem {
    /** メディアアイテム ID */
    id: string;
    /** 作成日時 */
    createTime?: GoogleApiDateTimeString;
    /** メディア種別（PHOTO / VIDEO / TYPE_UNSPECIFIED） */
    type?: 'PHOTO' | 'VIDEO' | 'TYPE_UNSPECIFIED';
    /** ファイル情報 */
    mediaFile?: {
      /** バイト取得用ベース URL（Authorization ヘッダが必要） */
      baseUrl: string;
      mimeType?: string;
      filename?: string;
      mediaFileMetadata?: {
        width?: number;
        height?: number;
        cameraMake?: string;
        cameraModel?: string;
      };
    };
  }

  /** Picker API の選択済みメディア一覧レスポンス */
  interface GooglePhotosPickedMediaItemsResponse {
    mediaItems?: GooglePhotosPickedMediaItem[];
    nextPageToken?: string;
  }

  /** イベントに紐づいたアルバムの情報（extendedProperties.shared に保存） */
  interface OrbitEventPhotoAlbum {
    /** アルバム ID（API で読めるのは作成者のみ） */
    albumId: string;
    /** Google フォトでアルバムを開く URL（作成者のみ有効。共有するには Google フォト側で共有設定が必要） */
    productUrl: string;
  }
}
