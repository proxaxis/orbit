/**
 * Google Photos Library API / Picker API の型定義。
 * @see https://developers.google.com/photos/library/reference/rest
 * @see https://developers.google.com/photos/picker/reference/rest
 */
declare global {
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
}
export {};
