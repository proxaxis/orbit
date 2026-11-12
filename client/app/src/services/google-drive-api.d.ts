/**
 * Google Drive API v3（appDataFolder）およびアプリ同期データの型定義。
 * @see https://developers.google.com/drive/api/reference/rest/v3/files
 */
declare global {
  /** Google Drive ファイルのメタデータ */
  interface GoogleDriveFile {
    /** ファイル ID */
    id: string;
    /** ファイル名 */
    name: string;
    /** 最終更新日時（RFC 3339） */
    modifiedTime?: string;
  }

  /** files.list のレスポンス */
  interface GoogleDriveFileList {
    files?: GoogleDriveFile[];
    nextPageToken?: string;
  }

  /**
   * appDataFolder に保存するアプリ同期データ（orbit-sync.json）。
   * Google Calendar API では保持できない情報をデバイス間で同期する。
   */
  interface OrbitDriveSyncData {
    /** スキーマバージョン */
    version: number;
    /** このデータを書き込んだ日時（ISO 8601）。同期の新しさ判定に使う */
    updatedAt: string;
    /** 個人設定（userStore.saveSettings が保存するオブジェクトと同一構造） */
    settings?: Record<string, any>;
    /** セッションカレンダー一覧（calendarStore.sessionCalendars と同一構造） */
    sessionCalendars?: GoogleCalendarListEntry[];
  }
}
export {};
