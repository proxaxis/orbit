# Orbit Calendar BFF

Google Calendar をフロントとする PWA の BFF サーバー。全ての Google API 呼び出しは
`POST /request` 経由でプロキシする（クライアントは Google API を直接叩かない）。

## 構成

- `src/index.js` — エントリポイント。Hono app 生成・CORS・ルート登録・スケジューラ起動のみ
- `src/assets/constants.js` — 環境変数（env 検証）と全定数・Realm スキーマ・Redis キー
- `src/services/` — realm.js（永続化+CRUD）, redis.js, google.js（OAuth/トークン）,
  session.js（Cookie）, push.js（VAPID/スケジューラ）, api-request-queue.js（キューワーカー）,
  utils.js
- `src/routes/` — ルート定義。ヘルパーはルート定義の後に記述する
- `src/env.d.ts` — 共有型を global 登録（EnvironmentVariables / Realm*/ApiRequestItem 等）。
  JSDoc の @type/@param から import なしで参照できる
- `@` エイリアス = `./src`（vite.config.js の resolve.alias と tsconfig paths）。import は
  相対パスではなく `@/` から書く
- 永続化:
  - **Realm**（`realm` パッケージ）— User / OAuthGrant / Session / ApiRequest / ApiRequestLog
  - **Redis**（ioredis）— OAuth state（短命）と Push 購読・スケジュールのみ
- `GET /api/location?url=` — Google Maps URL をスクレイピングして `{name, address?}` を返す。
  リダイレクト最大5回・各ホップで Maps ドメイン（`*.google.<tld>/maps` 等）と
  グローバル IP のみ許可・ボディ先頭1MB・結果は最終URLキーでメモリキャッシュ（6h）。
  ロジックは `src/services/location.js`（`locationDeps` で DNS/fetch を差替可能）
- `POST /request` は非同期キュー方式（`202` + `requestId` → `GET /request/:id` ポーリング）。
  単発エンベロープまたは `{ requests: [...] }` のバッチ形式（上限 50 件）。
  Realm の `ApiRequest` がキュー本体で、`pending → processing` は write トランザクションで
  排他クレームする（マルチインスタンス対応）。結果は done/failed 後 10 分保持。
  バッチは要素ごとの status を `responses[]` に格納し、要素の失敗でジョブは failed にしない
- `dist/` — `npm run build`（vite build）の出力先

## コマンド

- `npm run dev` — `vite-node --watch src/index.js`（`@` エイリアス解決つき）
- `npm test` — `node --import tsx --test`（tsx が tsconfig paths で `@` を解決）。
  テストはファイルごとに別の `REALM_PATH`（`/tmp/orbit-bff-*-test.realm`）を使う
  （ApiRequest ワーカーの干渉防止）。Redis 未到達のテストは自動 skip される
- `npm run build` — `tsc --noEmit`（checkJs 型検査）+ `vite build`（SSR バンドル → `dist/index.js`。
  node_modules は external でランタイム解決）
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
