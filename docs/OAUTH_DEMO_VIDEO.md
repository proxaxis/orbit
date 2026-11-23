# OAuth 検証デモ動画の台本と収録手順

Google OAuth 検証(プロジェクト `proxaxis-bolt-orbit`)の再提出用デモ動画の
撮影手順. 前回は「スコープの必要性を十分に実演していない」と指摘されたため,
指摘された 5 スコープ全ての「最大限の機能」を画面で見せる構成にする.

指摘対象スコープ:

- `https://www.googleapis.com/auth/calendar`
- `https://www.googleapis.com/auth/contacts.readonly`
- `https://www.googleapis.com/auth/contacts.other.readonly`
- `https://www.googleapis.com/auth/photoslibrary.appendonly`
- `https://www.googleapis.com/auth/photospicker.mediaitems.readonly`

スコープと機能の対応は `docs/GOOGLE_OAUTH_SCOPES.md` を参照.

## 収録の全体方針

- 動画は 1 本の連続した画面収録にする(クリップを連結してもよい)
- 収録中のブラウザはデモ用 Google アカウントにログインした状態で行う
- 各シーンで「どのスコープを使う機能か」をナレーションまたは字幕で示すと審査が通りやすい
- 同意画面はスコープが全て展開され読める状態にする(見えない場合は "Show all services" を押す)
- 書き込み・削除操作は, Google 本体側(calendar.google.com 等)でも反映を見せる
- 未検証スコープは本番ユーザーに出さないこと. 既に本番で同一スコープを要求している
  本アプリでは, 本番環境(orbit.proxaxis.me)でそのまま収録してよい

## シーン構成(推奨の順番)

### 0. 同意画面(手動収録)

まず同意画面を撮る. 既に認可済みだと再表示されないので, 事前に
`myaccount.google.com/permissions` で本アプリへのアクセスを取り消しておく.

1. `https://orbit.proxaxis.me/` を開き Google ログインを開始
2. 同意画面が出たらスコープ一覧を全展開して読める状態で数秒止める
   (カレンダー + イベント + プロフィールの 3 件が出る)
3. 続行してアプリにログイン
4. 個人設定(`/usr/config`)で「連絡先」「写真共有」の追加認可をそれぞれ開始し,
   各同意画面でもスコープを全展開して撮る
   (contacts.readonly / contacts.other.readonly と
   photoslibrary.appendonly / readonly.appcreateddata / photospicker.mediaitems.readonly が出る)

### 1. カレンダー一覧と共有設定(自動収録可)

スコープ: `auth/calendar`(calendarList + ACL)

- ホーム画面で左ナビのカレンダー一覧を映す(`01-calendar-list`)
- `/cal/sharing` を開き, 既存の共有ルール一覧を映す
- 共有相手のメールアドレスを入力して「追加」→ ルールが増える(`02-acl-sharing`)
- 追加したルールを削除して元に戻す(acl.delete の実演にもなる)

### 2. 予定の作成と削除(自動収録可)

スコープ: `auth/calendar` + `calendar.events`(補助実演)

- `/evt/new` で予定を作成 → カレンダー上に表示される(`03-event-crud`)
- 続けて詳細画面から削除

### 3. Google 側での反映確認(手動収録)

- `calendar.google.com` を開き, 作成した予定が消えている/共有カレンダーの
  設定画面に共有相手が並んでいることを映す(ソースアカウントへの影響の証明)
- 共有相手を消した場合はルールが消えた状態も映す

### 4. 招待者の連絡先検索(自動収録可)

スコープ: `contacts.readonly` + `contacts.other.readonly`

- `/evt/new` の「ユーザーを招待する」欄に名前を入力 →
  連絡先からの候補(名前 + メールアドレス)がプルダウンに出る(`04-contacts-suggest`)
- スクリプトは登録済み連絡先の検索語(`ORBIT_DEMO_CONTACT_QUERY`, 既定 `proxaxis`)を
  入力して候補を見せたあと, 「その他の連絡先」の検索語(`ORBIT_DEMO_OTHER_QUERY`,
  既定 `hosoda`)に打ち替えて, "その他の連絡先" バッジ付きの候補が出るところまで収録する
- その他の連絡先のマージ表示は `usePeople.js` で `searchContacts` と
  `otherContacts:search` を併用する実装になったため, このシーンの収録には
  その実装のデプロイ済み環境が必要

### 5. 写真アルバムとアップロード(自動収録可)

スコープ: `photoslibrary.appendonly`

- `/evt/new` で「保存時に写真アルバムを作成する」にチェック → 保存
- 詳細画面の「写真アルバム」欄でファイルをアップロード →
  サムネイルがグリッドに出る(`05-photos-upload`)

### 6. Photos Picker(手動収録)

スコープ: `photospicker.mediaitems.readonly`

- 詳細画面の「Google フォトから選択」を押す → Google 製の Picker が開く
- Google ログイン済みブラウザで写真を選択 → アプリ側に取り込まれて
  アルバムへ追加されるところまで収録
- その後 `photos.google.com` で作成されたアルバムと写真を映す(反映確認)

## 自動収録スクリプト

アプリ内シーン(1, 2, 4, 5)は `client/app/tools/oauth-demo-video.mjs` で
シーンごとの webm に自動収録できる. 実行にはログイン済みセッション Cookie が必要.

```bash
# 1. 本番にログインしたブラウザの session_id Cookie を /tmp/orbit-cookie.txt に保存
#    (形式: "session_id=xxxxx" または JSON 配列, screenshot.mjs と同じ)

# 2. 依存を入れる(初回のみ。ブラウザ取得が必要)
npm install
npx playwright install chromium

# 3. 収録
cd client/app
node tools/oauth-demo-video.mjs                    # 全シーン
node tools/oauth-demo-video.mjs 04-                # 連絡先シーンだけ

# オプション
ORBIT_DEMO_SHARE_WITH=partner@example.com \
ORBIT_DEMO_CONTACT_QUERY="proxaxis" \
ORBIT_DEMO_OTHER_QUERY="hosoda" \
node tools/oauth-demo-video.mjs
```

出力: `client/app/oauth-demo-recordings/NN-scene-name.webm`(gitignore 済み).

手動シーン(0, 3, 6)は OS の画面収録(macOS なら Shift+Cmd+5,
Windows なら Xbox Game Bar, Linux なら OBS)で撮り,
ffmpeg で順に連結する:

```bash
ffmpeg -f concat -safe 0 -i <(printf "file '%s'\n" *.webm) -c copy oauth-demo.webm
# mp4 に変換する場合
ffmpeg -i oauth-demo.webm -c:v libx264 -pix_fmt yuv420p oauth-demo.mp4
```

## 提出前チェックリスト

- [ ] 同意画面で全スコープが展開され読める(Show all services 済み)
- [ ] Cloud Console に登録したスコープと動画内の要求スコープが一致
- [ ] 5 スコープ全ての機能が画面内で実際に動いている
- [ ] 書き込み・削除が Google 本体側でも反映されているシーンがある
- [ ] AI セクションの返信文(下記)を送付済み
- [ ] プライバシーポリシーに端末内 AI 処理の記載がある(3.4 節)
- [ ] Cloud Console で変更を保存して再提出した

## Google への返信文(AI セクション)

メールへの返信にそのまま使える英文:

```
Thank you for the review. Regarding the AI/ML requirements:

Third-party AI integrations: Our application does not integrate with any
third-party AI service providers (no aggregators, gateways, or model hubs).
No Google user data is sent to any external AI service.

On-device model disclosure: The "Quick Add" natural-language input feature
runs an open-weight model entirely on the user's device using WebLLM
(@mlc-ai/web-llm), which executes locally in the browser via WebGPU. The
model weights are downloaded once from the public WebLLM/Hugging Face CDN
into the browser's local cache; user input and Google user data (calendar
events, contacts, photos) are processed locally and are never transmitted
to the model provider or used to create, train, or improve any model —
fully compliant with the Limited Use requirements. There is no server-side
inference.

Our privacy policy (https://orbit.proxaxis.me/privacy) now explicitly
discloses this on-device / offline AI processing (section 3, "端末内 AI
処理 (Quick Add)").

We have also re-recorded the demo video to demonstrate the full
functionality of every requested scope, including the OAuth consent
screens with all scopes expanded, and the resulting changes reflected in
the user's Google account (Google Calendar and Google Photos).
```

## メモ

- `oauth-demo-video.mjs` の録画はアプリ内シーンのみ. Google 側 UI
  (同意画面, Picker, calendar.google.com, photos.google.com)は
  自動化できないため手動収録
- 自動収録はログイン Cookie ベースのため同意画面は写らない. 同意画面は
  必ず手動シーン 0 で撮ること
- デモで使う共有相手・連絡先検索語はアカウントに実在するものを選ぶ
  (架空の候補だと「機能が動いている」証拠にならない)
