# AGENTS.md

このファイルは AI エージェント・開発者向けに, 本リポジトリの構成・規約・運用方法をまとめたものです.

## プロジェクト概要

Orbit Calendar (orbit-client) — Google カレンダーと同期する日本語対応のカレンダーアプリ.

- Quasar (@quasar/app-vite v3, rolldown-vite ベース) + Vue 3 (`<script setup>`) + Pinia + Vue Router
- `client_v1/`(Vite 製 PWA)から移行したコードベース. Quasar 化は Capacitor によるネイティブアプリ化が目的
- Google API は直接呼ばず, BFF(Backend-For-Frontend)サーバ経由でプロキシする
- オフライン対応(IndexedDB キャッシュ + オフライン操作キュー + Service Worker)
- 自然言語での予定登録(Quick Add)に WebLLM(`@mlc-ai/web-llm`)を使用
- 対象言語・ロケールは日本語(コメント・UI・テスト名も日本語)

## セットアップとコマンド

```bash
npm install            # Node >= 26, ^24, ^22.12 が必要
npm run dev            # quasar dev(SPA, port 9000, --host 0.0.0.0)
npm run build          # quasar build → dist/spa + vite.sw.config.js で dist/spa/sw.js を追記出力
npm run build:capacitor # quasar build -m capacitor -T android → src-capacitor/www
npm test               # vitest run(jsdom 環境, tests/setup.js で TZ=Asia/Tokyo 固定)
npm run format         # oxfmt(src/, tests/)
npm run lint:check     # oxfmt --check && oxlint
```

- `tunnel.txt` には cloudflared で開発サーバを外部公開するコマンドが記載されている(`./cloudflared tunnel --url http://localhost:9000`).
- 本番 OGP 等のホスト名は `orbit.proxaxis.me`(quasar.config.js の `build.extendViteConf` で allowedHosts 指定).
- 開発モードでは Service Worker は登録されず, 逆に古い SW とキャッシュが起動時に除去される(`useCache.js` の `registerServiceWorker`). SW 依存の動作確認は `npm run build` 後の `dist/spa` を静的配信して行うこと.
- dev サーバの `vueDevtools: true` は vite-plugin-vue-devtools を必要とする(devDependencies 済み).

### 環境変数(src/env.d.ts に型定義あり)

| 変数 | 用途 |
| --- | --- |
| `VITE_BFF_APP_BASE_URL` | BFF サーバのベース URL(未設定なら同一オリジン) |
| `VITE_CLIENT_APP_BASE_URL` | クライアントアプリのベース URL |
| `VITE_VAPID_PUBLIC_KEY` | Web Push の VAPID 公開鍵 |
| `VITE_GTM_ID` | Google タグマネージャーのコンテナ ID(`GTM-XXXXXXX`). 設定時は GTM 経由で計測(GA4 ID より優先) |
| `VITE_GA_MEASUREMENT_ID` | Google Analytics 4 の測定 ID(`G-XXXXXXX`). `VITE_GTM_ID` 未設定時に直接 gtag.js を読み込む. 両方未設定なら計測自体が無効 |

- Quasar では Vite 標準の env 取り込みは無効(`envDir: false`). 代わりに quasar.config.js の `build.env.clientPrefix: 'VITE_'` で, process.env と `.env`/`.env.local`(アプリルート)の `VITE_` 変数を `import.meta.env` へ公開している. Docker の env_file 経由(process.env)でも届く.
- `.env` は gitignore 済み.

## アーキテクチャ

### 全体構成

```
src/
  App.vue          # ルート. bootstrap 開始/停止 + グローバルスタイル
  boot/init.js     # Quasar boot ファイル. 解析初期化と SW 登録(v1 の main.js 相当)
  sw.js            # Service Worker(vite.sw.config.js で dist/spa/sw.js にバンドル)
  router/          # index.js(ルータ生成 + ガード), routes.js(named views ルート表)
  zones/           # デバイス別レイアウト殻(Sm/Md/Lg HomeZone, HomeLayout)
  pages/           # 各画面(月/週/日表示, イベント詳細/編集/検索, 設定など. v1 の views/ 相当)
  components/      # 共有 UI 部品(items/ に画面固有部品, icons/ に SVG アイコン)
  stores/          # Pinia ストア(状態のみ. ロジックは置かない). index.js が Pinia 生成
  composables/     # ビジネスロジック(API 調停, 同期, 通知, 初期化など)
  services/        # Vue/Pinia 非依存の純粋モジュール(API クライアント等)
  workers/         # Web Worker(イベント保存をメインスレッドから分離)
  styles/vars.scss # テーマ色・サイズの CSS 変数定義(light/dark)
  css/             # Quasar のグローバル SCSS(app.scss)と quasar.variables.scss
  assets/          # ロゴ, 絵文字データ
tests/             # vitest テスト(@/services や @/composables 中心)
tools/             # 動作検証スクリプト(Puppeteer/Playwright)
docs/              # ユーザーマニュアルとスクリーンショット
src-capacitor/     # Capacitor プロジェクト(android プラットフォーム込み, www は生成物)
```

### 重要な設計規則

- レイヤ分離: `stores/*` は状態保持のみ. API 通信・同期・キャッシュなどのロジックは `composables/*`. Vue/Pinia に依存しない純粋関数は `services/*` に置く. これにより同じ `services/*`・`useCache.js` をページ側と Service Worker(src/sw.js)の両方から import できる. SW から参照されるモジュールへ Vue 依存を持ち込まないこと.
- BFF 通信: 全 Google API 呼び出しは `services/bff-request.js` 経由. `POST {BFF}/request` にリクエストをキュー投入 → `GET /request/{id}` をポーリング → 再構築した `Response` を返す. 認証は cookie(`credentials: 'include'`). トークンは `GET {BFF}/api/token`(`?t=photo-sharing|people|drive` で用途別).
- トークン注入: 各 `google-*-api.js` は `setTokenRefresher()` で 401 時の再取得コールバックを外部注入する設計(ストア非依存を維持するため). 注入は起動時に `initApiClients()`(useAuth.js)で実行.
- オフライン: IndexedDB `orbit-offline` DB(キーは `CACHE_KEYS`). オフライン中のイベント操作は `event-operations` キューに積み, オンライン復帰/SW Background Sync で再送(`services/event-offline.js`).
- 通知: 3経路 — ページ側タイマー, SW の `sync`/`periodicsync`/`push`, BFF 経由の Web Push(購読 + スケジュールを BFF へ送信). SW → ページ間は `postMessage` の `orbit-*` メッセージで連携(`useAppBootstrap.js` の `handleServiceWorkerMessage` 参照).
- ビルド: `quasar build` で `dist/spa` に SPA を出力し, 続く `vite build --config vite.sw.config.js` で `src/sw.js` を単一 IIFE の `dist/spa/sw.js` に出力(依存を内包するため SW 関連モジュールの外部依存追加に注意). Quasar の PWA モードは使っていない.
- レイアウト: ルートは全て `HomeLayout` 配下で named views(`default`=メインカレンダー, `nav`=カレンダー一覧, `sub`=詳細/フォーム). `userStore` のデバイス判定(MOBILE/TABLET/DESKTOP)で Sm/Md/Lg の zone を切り替え, ペインのリサイズ・収納・スワイプは HomeLayout が統括.
- イベント拡張: タグは `extendedProperties.shared.orbitTags` + description 末尾の `#tag`. 写真アルバム・共有コピー・カスタム休日も拡張プロパティで識別(`services/event-tags.js`, `share-sync.js`, `custom-holidays.js`).

### Quasar 移行に伴う差異

- ルーティング: named views はファイル名ベースの自動ルーティングで表現できないため, quasar.config.js の `filenameBasedRouting: false` + `src/router/routes.js` の手動定義. 画面コンポーネントは v1 の `views/` から `pages/` へ移動.
- ルータ: SSR を使わないため `router/index.js` はインスタンスを直接 export(defineRouter ラップしない). これにより composables からの `import router` や vitest での利用が v1 と同じく機能する.
- URL モード: Web(SPA)は history, Capacitor は hash(quasar.config.js で ctx.mode.capacitor 判定).
- エイリアス: `@/` → `src/` は @quasar/app-vite の既定エイリアス(ビルド・jsconfig ともに対応済み). vitest/vite.sw.config.js では個別に `resolve.alias` を定義している.
- 初期化: v1 の main.js が行っていた `initAnalytics()` と `registerServiceWorker()` は `src/boot/init.js` へ移動. Pinia は `stores/index.js`, Router は `router/index.js` が担う(Quasar が自動配線).
- エントリ HTML: `index.html` は Quasar のテンプレート構文(`<%= productName %>` 等)を使える. `<!-- quasar:entry-point -->` が必須.

## コーディング規約

- 言語: JavaScript + JSDoc(TypeScript は `.d.ts` の型宣言のみ). `jsconfig.json` で `checkJs: true`, `@/` = `src/` のエイリアス.
- コメント: 日本語. モジュール先頭に役割の JSDoc, 公開関数に `@param`/`@returns` を付ける既存スタイルに倣う.
- フォーマット: `oxfmt`(`.oxfmtrc.json`: セミコロンあり, シングルクォート, printWidth 300, `bracketSameLine`). 変更後は `npm run format` を推奨.
- Vue SFC: `<script setup>` + `<template>` + `<style lang="scss">`. スタイルは CSS 変数(`--bg-*`, `--text`, `--primary`, `--space-*` など, `styles/vars.scss` 由来)を使い, 色のハードコードを避ける.
- テスト: vitest + jsdom + `@vue/test-utils`, `tests/` に `*.test.js`. `tests/setup.js` で `TZ=Asia/Tokyo` 固定・matchMedia スタブ. 実行は `npm test`(設定は `vitest.config.js`, Quasar とは独立).
- 日時: `services/dayjs.js` 経由で import(ja ロケール設定済み + `toDayjs` 等のヘルパー). `dayjs` 直接 import でもよいが locale はこのモジュールが担う.
- エラーハンドリング: 既存コードは「失敗しても UI をブロックしない」方針が多い(キャッシュ書き込み失敗は warn, 非対応 API は静かにスキップ). 過剰な try/catch は避け, 既存の粒度に合わせる.

## 主要な機能と所在

| 機能 | ファイル |
| --- | --- |
| 起動シーケンス | `composables/useAppBootstrap.js` |
| 認証・トークン | `composables/useAuth.js`, `stores/auth.js` |
| BFF 転送 | `services/bff-request.js` |
| Google API | `services/google-{calendar,people,photo,drive}-api.js` |
| イベント CRUD/同期 | `composables/useEvents.js`, `services/event-offline.js`, `services/event-sync-worker.js` + `workers/` |
| カレンダー管理 | `composables/useCalendars.js`, `stores/calendar.js` |
| 通知/Web Push | `composables/useNotifications.js`, `usePushNotifications.js`, `sw.js` |
| 範囲指定共有 | `composables/useShare.js`, `services/share-sync.js` |
| 設定の Drive 同期 | `composables/useDriveSync.js`, `services/google-drive-api.js` |
| 写真アルバム | `composables/usePhotos.js`, `services/google-photo-api.js` |
| 連絡先 | `composables/usePeople.js`, `services/google-people-api.js` |
| Quick Add(自然言語) | `composables/useQuickAdd.js`(正規化 + WebLLM) |
| 繰り返し(RRULE) | `services/rrule.js` + `rrule` パッケージ |
| 祝日 | `services/japanese-holidays.js`, `services/custom-holidays.js` |
| キャッシュ/SW 基盤 | `composables/useCache.js` |
| Service Worker | `src/sw.js` → `dist/spa/sw.js` |

## 注意事項

- `tools/screenshot.mjs` …本番環境の画面撮影スクリプト(Puppeteer). ログイン済み Cookie を `/tmp/orbit-cookie.txt`(リポジトリ外)に置いて `node tools/screenshot.mjs [名前フィルタ]` で実行. BFF は `bff-orbit.proxaxis.me` の別サブドメインのため Cookie は親ドメインで設定する.
- `tools/sync-check.mjs` / `tools/sync-check-ext.mjs` …2ブラウザコンテキスト間の同期検証スクリプト(Puppeteer). `ORBIT_COOKIE_A`/`ORBIT_COOKIE_B` に各セッションの `session_id` の値を渡して実行する(dev サーバ + BFF が起動していること). Cookie は環境変数でのみ渡しファイルに保存しない.
- `tools/webkit-check.mjs` …Playwright WebKit でのレンダリング検証(スクリーンショット + 縦スクロール月タイトル追従). WebKit のシステム依存ライブラリが不足する環境では `/tmp/wk-libs`(deb をローカル展開)の `LD_LIBRARY_PATH`・EGL/DRI 環境変数が必要. HTTPS リソースは TLS バックエンド欠如で読み込めず環境起因のコンソールエラーが出る(アプリ自体は HTTP で動作).
- `tools/share-check.mjs` …2セッション共有フロー検証(Playwright WebKit). `ORBIT_COOKIE_A`/`ORBIT_COOKIE_B` に各セッションの `session_id` を渡して実行. dev サーバの既定ポートは 9000.
- Worker への `postMessage` には Vue のリアクティブオブジェクト(Proxy)を渡せない. structuredClone 不可で WebKit では `DataCloneError` になる(Chrome では動いてしまうので見逃しやすい). `runEventOperation` と `writeCache` は JSON 正規化済み. Worker・IndexedDB・SW メッセージへ値を渡す新しい経路を作る場合も同様に正規化すること.
- Google Calendar の権限: `extendedProperties.shared`(アイコン・タグ・祝日調整・写真アルバム紐づけ)はイベントの主催者(`organizer.self`)のみ変更可能. 非主催者が値を変えると PATCH 全体が `403 forbiddenForNonOrganizer` になる(同じ値の再送は許容). `private` は閲覧者ごとの領域なので非主催者でも書き込める. また `extendedProperties` の `null` キー削除は, サーバ側にそのセクション自体がないと `400 Required` になる.
- `dist/` と `src-capacitor/www` はビルド成果物なので手編集しない. `tunnel.txt` は開発用トンネル用.
- `checkJs` による型検査が効くため, JSDoc 型を正確に保つこと(グローバル型は `env.d.ts`, サービス別型は各 `.d.ts`).
- Git 管理対象. `.quasar/`・`dist/`・`src-capacitor/www` は gitignore 済み.
