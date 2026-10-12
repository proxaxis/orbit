# AGENT.md

このファイルは AI エージェント・開発者向けに、本リポジトリの構成・規約・運用方法をまとめたものです。

## プロジェクト概要

**Orbit Calendar**(`orbit-client`)— Google カレンダーと同期する日本語対応の PWA カレンダーアプリ。

- Vue 3 (`<script setup>`)+ Vite + Pinia + Vue Router の SPA/PWA クライアント
- Google API は直接呼ばず、**BFF(Backend-For-Frontend)サーバ経由**でプロキシする
- オフライン対応(IndexedDB キャッシュ + オフライン操作キュー + Service Worker)
- 自然言語での予定登録(Quick Add)に WebLLM(`@mlc-ai/web-llm`)を使用
- 対象言語・ロケールは日本語(コメント・UI・テスト名も日本語)

## セットアップとコマンド

```bash
npm install        # Node ^22.18.0 または >=24.12.0 が必要
npm run dev        # 開発サーバ(vite, port 5173, --host 0.0.0.0)
npm run build      # アプリ本体 + Service Worker の2段ビルド → dist/
npm test           # vitest run(jsdom 環境, tests/setup.js で TZ=Asia/Tokyo 固定)
npm run preview    # ビルド成果物のプレビュー
npm run format     # oxfmt によるフォーマット(src/ が対象)
```

- `tunnel.txt` には cloudflared で開発サーバを外部公開するコマンドが記載されている(`./cloudflared tunnel --url http://localhost:5173`)。
- 本番 OGP 等のホスト名は `orbit.proxaxis.me`(vite.config.js の `allowedHosts` 参照)。
- **開発モードでは Service Worker は登録されず、逆に古い SW とキャッシュが起動時に除去される**(`useCache.js` の `registerServiceWorker`)。SW 依存の動作確認は `npm run build && npm run preview` で行うこと。

### 環境変数(src/env.d.ts に型定義あり)

| 変数 | 用途 |
| --- | --- |
| `VITE_BFF_APP_BASE_URL` | BFF サーバのベース URL(未設定なら同一オリジン) |
| `VITE_CLIENT_APP_BASE_URL` | クライアントアプリのベース URL |
| `VITE_VAPID_PUBLIC_KEY` | Web Push の VAPID 公開鍵 |

`.env` は gitignore 済み。`.env.example` は存在しない。

## アーキテクチャ

### 全体構成

```
src/
  main.js          # エントリ。Pinia/Router 登録 + SW 登録
  App.vue          # ルート。bootstrap 開始/停止、グローバルスタイル
  sw.js            # Service Worker(別設定で dist/sw.js にバンドル)
  router/          # ルート定義。named views(default/nav/sub)で3ペイン構成
  zones/           # デバイス別レイアウト殻(Sm/Md/Lg HomeZone, HomeLayout)
  views/           # 各画面(月/週/日表示、イベント詳細/編集/検索、設定など)
  components/      # 共有 UI 部品(items/ に画面固有部品、icons/ に SVG アイコン)
  stores/          # Pinia ストア(状態のみ。ロジックは置かない)
  composables/     # ビジネスロジック(API 調停、同期、通知、初期化など)
  services/        # Vue/Pinia 非依存の純粋モジュール(API クライアント等)
  workers/         # Web Worker(イベント保存をメインスレッドから分離)
  styles/vars.scss # テーマ色・サイズの CSS 変数定義(light/dark)
  assets/          # ロゴ、絵文字データ
tests/             # vitest テスト(@/services や @/composables 中心)
```

### 重要な設計規則

- **レイヤ分離**: `stores/*` は状態保持のみ。API 通信・同期・キャッシュなどのロジックは `composables/*`。Vue/Pinia に依存しない純粋関数は `services/*` に置く。これにより同じ `services/*`・`useCache.js` を **ページ側と Service Worker(src/sw.js)の両方から import できる**。SW から参照されるモジュールへ Vue 依存を持ち込まないこと。
- **BFF 通信**: 全 Google API 呼び出しは `services/bff-request.js` 経由。`POST {BFF}/request` にリクエストをキュー投入 → `GET /request/{id}` をポーリング → 再構築した `Response` を返す。認証は cookie(`credentials: 'include'`)。トークンは `GET {BFF}/api/token`(`?t=photo-sharing|people|drive` で用途別)。
- **トークン注入**: 各 `google-*-api.js` は `setTokenRefresher()` で 401 時の再取得コールバックを外部注入する設計(ストア非依存を維持するため)。注入は起動時に `initApiClients()`(useAuth.js)で実行。
- **オフライン**: IndexedDB `orbit-offline` DB(キーは `CACHE_KEYS`)。オフライン中のイベント操作は `event-operations` キューに積み、オンライン復帰/SW Background Sync で再送(`services/event-offline.js`)。
- **通知**: 3経路 — ①ページ側タイマー ②SW の `sync`/`periodicsync`/`push` ③BFF 経由の Web Push(購読 + スケジュールを BFF へ送信)。SW → ページ間は `postMessage` の `orbit-*` メッセージで連携(`useAppBootstrap.js` の `handleServiceWorkerMessage` 参照)。
- **ビルド**: `vite build` の後 `vite build --config vite.sw.config.js` で `src/sw.js` を単一 IIFE の `dist/sw.js` に出力(依存を内包するため SW 関連モジュールの外部依存追加に注意)。
- **レイアウト**: ルートは全て `HomeLayout` 配下で named views(`default`=メインカレンダー、`nav`=カレンダー一覧、`sub`=詳細/フォーム)。`userStore` のデバイス判定(MOBILE/TABLET/DESKTOP)で Sm/Md/Lg の zone を切り替え、ペインのリサイズ・収納・スワイプは HomeLayout が統括。
- **イベント拡張**: タグは `extendedProperties.shared.orbitTags` + description 末尾の `#tag`。写真アルバム・共有コピー・カスタム休日も拡張プロパティで識別(`services/event-tags.js`, `share-sync.js`, `custom-holidays.js`)。

## コーディング規約

- **言語**: JavaScript + JSDoc(TypeScript は `.d.ts` の型宣言のみ)。`jsconfig.json` で `checkJs: true`、`@/` = `src/` のエイリアス。
- **コメント**: 日本語。モジュール先頭に役割の JSDoc、公開関数に `@param`/`@returns` を付ける既存スタイルに倣う。
- **フォーマット**: `oxfmt`(`.oxfmtrc.json`: セミコロンあり、シングルクォート、printWidth 300、`bracketSameLine`)。変更後は `npm run format` を推奨。
- **Vue SFC**: `<script setup>` + `<template>` + `<style lang="scss">`。スタイルは CSS 変数(`--bg-*`, `--text`, `--primary`, `--space-*` など、`styles/vars.scss` 由来)を使い、色のハードコードを避ける。
- **テスト**: vitest + jsdom + `@vue/test-utils`、`tests/` に `*.test.js`。`tests/setup.js` で `TZ=Asia/Tokyo` 固定・matchMedia スタブ。実行は `npm test`。
- **日時**: `services/dayjs.js` 経由で import(ja ロケール設定済み + `toDayjs` 等のヘルパー)。`dayjs` 直接 import でもよいが locale はこのモジュールが担う。
- **エラーハンドリング**: 既存コードは「失敗しても UI をブロックしない」方針が多い(キャッシュ書き込み失敗は warn、非対応 API は静かにスキップ)。過剰な try/catch は避け、既存の粒度に合わせる。

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
| Service Worker | `src/sw.js` → `dist/sw.js` |

## 注意事項

- `docs/` …ユーザーマニュアル(`manual.md`)とスクリーンショット(`assets/`)。
- `tools/screenshot.mjs` …本番環境の画面撮影スクリプト(Puppeteer)。ログイン済み Cookie を `/tmp/orbit-cookie.txt`(リポジトリ外)に置いて `node tools/screenshot.mjs [名前フィルタ]` で実行。BFF は `bff-orbit.proxaxis.me` の別サブドメインのため Cookie は親ドメインで設定する。
- `tools/sync-check.mjs` / `tools/sync-check-ext.mjs` …2ブラウザコンテキスト間の同期検証スクリプト(Puppeteer)。`ORBIT_COOKIE_A`/`ORBIT_COOKIE_B` に各セッションの `session_id` の値を渡して実行する(dev サーバ + BFF が起動していること)。Cookie は環境変数でのみ渡しファイルに保存しない。
- `dist/` はビルド成果物なので手編集しない。`cloudflared` バイナリと `tunnel.txt` は開発用トンネル用。
- `checkJs` による型検査が効くため、JSDoc 型を正確に保つこと(グローバル型は `env.d.ts`、サービス別型は各 `.d.ts`)。
- Git リポジトリではない(`.git` なし)環境のため、変更履歴はファイルで確認できない。
