# Orbit Calendar BFF

Google Calendar をフロントとする PWA の BFF サーバー。全ての Google API 呼び出しは
`POST /request` 経由でプロキシする（クライアントは Google API を直接叩かない）。

## 構成

- `src/index.js` — Hono 製の単一ファイルアプリ。ESM + JSDoc 型注釈（`checkJs` 有効）
- 永続化:
  - **Realm**（`realm` パッケージ）— User / OAuthGrant / Session / ApiRequest / ApiRequestLog
  - **Redis**（ioredis）— OAuth state（短命）と Push 購読・スケジュールのみ
- `POST /request` は非同期キュー方式（`202` + `requestId` → `GET /request/:id` ポーリング）。
  単発エンベロープまたは `{ requests: [...] }` のバッチ形式（上限 50 件）。
  Realm の `ApiRequest` がキュー本体で、`pending → processing` は write トランザクションで
  排他クレームする（マルチインスタンス対応）。結果は done/failed 後 10 分保持。
  バッチは要素ごとの status を `responses[]` に格納し、要素の失敗でジョブは failed にしない
- `dist/` — `npm run build`（tsc）の出力先

## コマンド

- `npm run dev` — tsx watch で起動
- `npm test` — `node --test`。テストはファイルごとに別の `REALM_PATH`（`/tmp/orbit-bff-*-test.realm`）を使う
  （ApiRequest ワーカーの干渉防止）。Redis 未到達のテストは自動 skip される
- `npm run build` — tsc で `dist/` へ emit（checkJs による型検査も兼ねる）
- `npm start` — `node --env-file=.env dist/index.js`

## 注意点

- Realm を開いたプロセスは `realm.close()` しても内部スレッドで終了しない。
  テストの `after` フックで `setTimeout(() => process.exit(0), 100).unref()` している
- セッション Cookie は `SameSite=None; Secure`（クロスオリジン必須）。
  http://localhost では Secure Cookie が使えるが、localhost 以外の http 環境では
  ブラウザが Cookie を保存しない
- グラントは `OAuthGrant.id = ${userId}/${type}`（type: main / photo-sharing / people / drive）。
  drive は appDataFolder 同期用で `drive.appdata` スコープのみ（メイン認可には含めない）
- 上流 401 時はリフレッシュして 1 回だけ再試行。invalid_grant はグラントを削除し
  `SCOPE_NOT_AUTHORIZED`（403）を返す
