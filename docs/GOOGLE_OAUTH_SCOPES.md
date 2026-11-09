# Google OAuth スコープの使用方法

Orbit Calendar が Google OAuth で要求するスコープと、それぞれの用途・呼び出す API・
対応する機能の一覧。

スコープ定義の単一ソース: `server/app/src/assets/constants.js`
（`MAIN_SCOPES` / `PHOTO_SHARING_SCOPES` / `PEOPLE_SCOPES` / `DRIVE_SCOPES`）。

すべての Google API 呼び出しは BFF（`POST /request`）経由でプロキシされ、
クライアントから Google API を直接叩くことはない。BFF 側でホスト名の
許可リスト（`API_REQUEST_ALLOWED_HOSTS` 相当）により到達先も制限している。

## メイン認可（ログイン時に要求）

| スコープ | 用途 | 呼び出す API |
| --- | --- | --- |
| `calendar` | カレンダー一覧・カレンダー詳細・ACL の読み書き | `calendarList.list/get`・`calendars.get`・`acl.list/insert/patch/delete`（共有設定） |
| `calendar.events` | 予定・タスクイベントの読み書き（作成・更新・削除・移動・instances 展開） | `events.list/get/insert/patch/delete/move/instances`・`freeBusy` |
| `userinfo.profile` | 表示名・アバターの取得（ログイン時） | `oauth2.userinfo.get`（id_token デコード失敗時のフォールバック。`server/app/src/services/google.js`） |

予定に加えて**タスク**も Google Calendar イベントとして保存される
（`extendedProperties.shared` に `orbitIsTask` 等を格納）ため、
タスク機能も `calendar` / `calendar.events` スコープで動作する。

## 追加認可（オプトイン・設定画面から個別に許可）

メイン認可には含めず、利用時に別グラント
（`OAuthGrant.id = {userId}/{type}`、type: `photo-sharing` / `people` / `drive`）
として保存される。コールバックは `/enable`、state の `t` でタイプを識別。

### photo-sharing（写真共有・アルバム添付）

| スコープ | 用途 | 呼び出す API |
| --- | --- | --- |
| `photoslibrary.appendonly` | 予定に添付する写真をアプリ作成アルバムへアップロード | `mediaItems:batchCreate`・`uploads`・`albums` |
| `photoslibrary.readonly.appcreateddata` | アプリが作成したアルバム・メディアの参照 | `albums.get`・`mediaItems.get`（`appcreateddata` 限定） |
| `photospicker.mediaitems.readonly` | Photos Picker でユーザーが選択した写真の読み取り | `sessions` 作成・`mediaItems?sessionId=`（Picker 選択分のみ） |

※ 広範な `photoslibrary` スコープは廃止済みのため、appendonly +
appcreateddata + Picker の最小構成。

### people（招待者の連絡先検索）

| スコープ | 用途 | 呼び出す API |
| --- | --- | --- |
| `contacts.readonly` | 予定・タスクの招待者入力時の連絡先検索（名前/メール/写真の readMask） | `people:searchContacts` |
| `contacts.other.readonly` | 「その他の連絡先」（Gmail 宛先履歴等）の検索 | `otherContacts.list`・`otherContacts:search` |

### drive（設定のクラウド同期）

| スコープ | 用途 | 呼び出す API |
| --- | --- | --- |
| `drive.appdata` | アプリ設定・セッションカレンダーを `appDataFolder` の `orbit-sync.json` に同期 | `files.list/create/get/update`（`spaces=appDataFolder` 限定） |

※ `drive` 一般・`drive.file`・`drive.readonly` は要求しない
（`auth.test.js` で検証済み）。ユーザー作成ファイルには触れない。

## スコープ要求フロー

```
ログイン          → MAIN_SCOPES（calendar + calendar.events + userinfo.profile）
写真添付を利用     → + PHOTO_SHARING_SCOPES
招待者検索を利用   → + PEOPLE_SCOPES
Drive 同期を有効化 → + DRIVE_SCOPES
```

- 要求していないスコープの API を呼んだ場合、上流 401 → トークン更新して
  1 回だけ再試行。`invalid_grant` はグラント削除のうえ
  `SCOPE_NOT_AUTHORIZED`（403）を返し、クライアント側で再認可を促す。
- `openid` / `userinfo.email` は明示要求していない
  （`userinfo.profile` スコープの id_token / userinfo で sub・name・picture を取得）。

---

## Google OAuth 検証向け: スコープ必要性の説明

### なぜこのスコープが必要か / どう使うか / なぜ狭いスコープでは不足か

**`https://www.googleapis.com/auth/calendar`**
- 用途: カレンダー一覧の取得、各カレンダーの表示名・色・タイムゾーンの反映、
  共有設定 UI からの ACL（`acl.list/insert/patch/delete`）操作。
- 狭いスコープでは不足な理由: `calendar.events` はイベントのみで
  calendarList・ACL を含まない。`calendar.readonly` は書き込み不可。
  `calendar.calendarlist` / `calendar.freebusy` / `calendar.settings.readonly`
  の分割スコープでは ACL の読み書き（共有相手への権限付与）をカバーできない。

**`https://www.googleapis.com/auth/calendar.events`**
- 用途: 予定とタスク（Google Calendar イベントとして保存）の
  作成・取得・更新・削除・移動、繰り返しの instances 展開、招待者属性の更新、
  オフラインキュー経由の差分 PATCH。
- 狭いスコープでは不足な理由: `calendar.events.readonly` では
  insert/patch/delete/move ができず、本アプリの中核機能（イベント編集）が
  成立しない。

**`https://www.googleapis.com/auth/userinfo.profile`**
- 用途: ログイン時に id_token / userinfo から sub・name・picture を取得し、
  アカウント表示とセッション識別に使う。
- 狭いスコープでは不足な理由: これ以上狭いプロフィール系スコープはなく、
  メールアドレス (`userinfo.email`) は要求していない最小構成。

**`https://www.googleapis.com/auth/photoslibrary.appendonly`**
- 用途: 予定に添付する写真を、アプリ専用アルバムへアップロードする
  （`uploads` + `mediaItems:batchCreate`）。
- 狭いスコープでは不足な理由: アップロード自体にこのスコープが必須。
  既存ライブラリ全体への書き込みを許可する旧 `photoslibrary` スコープは
  使わず「追加のみ」に限定している。

**`https://www.googleapis.com/auth/photoslibrary.readonly.appcreateddata`**
- 用途: 本アプリが作成したアルバム・メディアのみ参照
  （既存ライブラリの他データは読めない設計）。
- 狭いスコープでは不足な理由: `appcreateddata` 限定で既に最も狭い
  読み取りスコープ。`photoslibrary.readonly` は全ライブラリを対象とするため不使用。

**`https://www.googleapis.com/auth/photospicker.mediaitems.readonly`**
- 用途: Photos Picker でユーザーが明示選択した写真のみ取り込む。
- 狭いスコープでは不足な理由: Picker 経由のユーザー選択アイテムに限定される
  現行の最小スコープであり、ライブラリ全体へのアクセスを伴わない。

**`https://www.googleapis.com/auth/contacts.readonly`**
- 用途: 予定・タスクの招待者入力時に、連絡先から名前・メールアドレス・
  写真を検索して attendee 候補を提示する（`people:searchContacts`）。
- 狭いスコープでは不足な理由: `directory.readonly` は Workspace
  ディレクトリのみで個人連絡先をカバーしない。読み取り専用で
  書き込みスコープは要求しない。

**`https://www.googleapis.com/auth/contacts.other.readonly`**
- 用途: 連絡先未登録の相手（Gmail 送信履歴等の「その他の連絡先」）も
  招待者候補として検索する（`otherContacts.list/:search`）。
- 狭いスコープでは不足な理由: `contacts.readonly` は登録済み連絡先のみで、
  otherContacts にはアクセスできない。招待先として最も使われる層を
  カバーするために必要。

**`https://www.googleapis.com/auth/drive.appdata`**
- 用途: アプリ設定・セッションカレンダーを隠し領域 `appDataFolder` の
  `orbit-sync.json` に同期する。
- 狭いスコープでは不足な理由: `drive.appdata` は appDataFolder のみに
  限定される Drive 系で最も狭いスコープ。ユーザーの Drive ファイルには
  一切触れない。`drive.file` や `drive.readonly` はより広いため不使用。

### 検証フォーム用・要約文（英語 / 約950文字）

```
Orbit Calendar is a calendar PWA backed by Google Calendar. Scope usage:
- auth/calendar: list calendars, read calendar metadata, and manage sharing
  ACLs (acl.list/insert/patch/delete) from the sharing settings UI. Narrower
  scopes (calendar.events, calendarlist, freebusy, readonly) cannot cover
  calendarList + ACL writes.
- auth/calendar.events: create/read/update/delete/move events — including
  tasks stored as Calendar events — and expand recurring instances.
  events.readonly cannot perform writes.
- auth/userinfo.profile: obtain sub/name/picture for account display only.
- photoslibrary.appendonly + readonly.appcreateddata +
  photospicker.mediaitems.readonly: attach user-picked photos to events via
  an app-created album; the legacy broad photoslibrary scope is not used.
- contacts.readonly + contacts.other.readonly: search contacts and "other
  contacts" to suggest event attendees. directory.readonly does not cover
  personal contacts.
- drive.appdata: sync app settings to a hidden file in appDataFolder only —
  the narrowest Drive scope; no user files are accessed.
All API calls are proxied through our BFF; the client never calls Google
directly.
```
