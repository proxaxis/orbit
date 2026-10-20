# クライアント変更履歴

## タスク管理機能の追加

カレンダーイベントを「タスク」として扱えるようにした。タスクは Google Calendar イベントとして保存され、既存のオフラインキュー・同期・通知基盤をそのまま利用する。

### データモデル

タスクは通常の Google カレンダーイベントに shared 拡張プロパティを付けて表現する。

- `orbitIsTask`: `'1'` のときタスク
- `orbitTaskStatus`: `not-started` / `in-progress` / `pending` / `completed`、およびカスタム文字列
- `orbitTaskDeferred`: `'1'` のとき未完了タスクを翌日へ自動で持ち越す

### 新規ファイル

- `src/services/task-events.js` — タスク判定・ステータス解析・編集権限判定・日次集計・持ち越し PATCH 生成・終日タスクの通知集約を担う純粋モジュール
- `src/composables/useTasks.js` — ステータス/持ち越し設定の変更と期限切れタスクの翌日送りを担うコンポーザブル。`initTasks` は起動時・定期（5分毎）・オンライン復帰・表示復帰で持ち越しスキャンを実行し、`useAppBootstrap.js` の起動シーケンスに組み込み済み。オフラインキューに保留中の操作があるイベントは持ち越し対象から除外する
- `src/views/TaskCreatorView.vue` — タスク登録専用のビュー（`/task/new`）。フォーム本体は `EventForm` を `task` prop でタスク専用モードにして利用する（共有プロパティ付与・非公開固定・招待者への `guestsCanModify` 付与は EventForm 側が担う）
- `tests/task-events.test.js` — タスクサービスの単体テスト

### 作成・編集

- `src/router/index.js` — `TaskCreator` ルート（`/task/new`、sub ペイン）を追加
- `EventForm.vue` — タスクイベントの編集・作成（`task` prop のタスク専用モード）に対応。タスクは公開設定 `private` に固定され（共有カレンダーの閲覧者には見えない）、初期ステータス・翌日持ち越しを設定できる。招待者がいるタスクには `guestsCanModify: true` を付与してタスクプロパティの変更を許可する。タスクの通知は開始時刻/ユーザー設定時刻で送られるためリマインダー欄は非表示にした。複製・テンプレートからの作成にも対応
- 3つのカレンダービュー（月・週タイムライン）のセル右クリックメニューに「タスクを追加」を追加。専用のタスク登録ビュー（`/task/new`）を開き、週ビューの時間帯ドラッグでは時間指定タスク、それ以外は終日タスクとして作成する

### カレンダー表示

- 月・週の各セル上部に「タスク +N」チップを表示（未完了タスク数）。タスクはイベントバー/タイムラインの配置から除外し、チップに集約する

### DateEventsView / カード

- タスクのカードに完了チェックボックスを追加（`not-started` ⇔ `completed`）。非既定ステータス（進行中・保留・カスタム）はチップで表示し、完了済みタスクはタイトルに取り消し線を引く
- 完了済みタスクは一覧の末尾の「完了済みタスク（N件）」アコーディオンにまとめて表示する

### EventDetailView

- タスクのステータス行を追加。4つの既定ステータスと「カスタム…」の自由入力で変更でき、翌日持ち越しのオン/オフも可能。権限がない場合は読み取り表示になる

### 通知

- 時間指定タスクは開始時刻に通知する（イベントのリマインダー設定は使わない）
- 終日タスクはユーザー設定の時刻（複数指定可・既定 09:00・空にすると無効）に、その日に重なる未完了終日タスクを1件へ集約したダイジェスト通知を送る
- `useNotifications.js` / `src/sw.js`（Background Sync / Periodic Sync）/ `usePushNotifications.js`（BFF プッシュ）の各配信経路でエントリ固有の `title`/`body` を優先するよう対応
- 設定 UI: `UserConfigViewNotificationSection.vue` に終日タスク通知時刻の編集欄を追加（`userStore.taskNotificationTimes`、最大5件）

### 持ち越し（deferral）

- `isDeferred` が有効な未完了タスクは、終了日が過ぎるとバックグラウンドで期間を保ったまま日付を今日へ移す。完了済みタスクや当日以降に残るタスクは移さない。オフライン時は既存の操作キュー経由で後日同期される

### 共有・オフライン

- `share-sync.js` でタスクイベントを共有コピーの対象外にした（招待者は元のイベントの参加者としてのみ見える）
- ステータス変更・持ち越し・作成はすべて既存の `updateEvent`/オフライン操作キュー経路を使用し、オフラインでも操作できる

### 補足

- shared 拡張プロパティの非主催者 PATCH はイベントの `guestsCanModify` に依存する（Google が拒否した場合は既存の再送経路と同じ失敗挙動になる）
- 招待者（非主催者）がフォームでイベント全体を編集する場合、shared セクションは従来通り送信しないためタスク化/解除は主催者のみ。ステータス変更は詳細画面の最小 PATCH で行える
- タスク PATCH（ステータス・持ち越しの更新）には既存タグ（`orbitTags`）を同じ値で同送している。`updateEvent` のローカル保存モデルは PATCH に `extendedProperties.shared` が含まれるとタグを再評価するため、同送しないとローカル側のタグが失われる（同値の再送は非主催者でも許容される）

### 変更ファイル一覧

- 新規: `src/services/task-events.js`, `src/composables/useTasks.js`, `src/views/TaskCreatorView.vue`, `tests/task-events.test.js`
- 変更: `src/router/index.js`, `src/composables/useAppBootstrap.js`, `src/composables/useNotifications.js`, `src/composables/usePushNotifications.js`, `src/sw.js`, `src/services/share-sync.js`, `src/stores/user.js`, `src/components/EventForm.vue`, `src/components/items/DateEventsViewEventCard.vue`, `src/components/items/UserConfigViewNotificationSection.vue`, `src/views/DateEventsView.vue`, `src/views/EventDetailView.vue`, `src/views/CalendarMonthHorizonView.vue`, `src/views/CalendarMonthVerticalView.vue`, `src/views/CalendarWeekTimelineView.vue`
- 再利用（変更なし）: `src/composables/useEventSubmit.js`, `src/composables/useEvents.js`, `src/services/event-offline.js`, `src/components/AccordionMenu.vue`, `src/components/items/EventFormAttendeeField.vue`
- 検証: `npx vitest run`（208件）・`npm run build`・`npm run format`（oxfmt）すべて通過
