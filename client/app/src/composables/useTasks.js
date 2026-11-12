/**
 * タスクイベントのステータス変更・持ち越し（翌日送り）を担うコンポーザブル。
 * 永続化・オフラインキュー・通知リスケジュールは useEvents の updateEvent が担うため、
 * ここではタスク固有の PATCH ボディ構築と権限判定だけを行う。
 */
import dayjs from '@/services/dayjs.js';
import { useEvents } from '@/composables/useEvents.js';
import { useEventStore } from '@/stores/event.js';
import { useCalendarStore } from '@/stores/calendar.js';
import { getStoredEvents } from '@/services/event-offline.js';
import { TAGS_SHARED_PROPERTY } from '@/services/event-tags.js';
import { buildTaskDeferralPatch, canEditTaskProperties, isTaskCompleted, normalizeTaskStatus, TASK_DEFERRED_PROPERTY, TASK_STATUS_COMPLETED, TASK_STATUS_NOT_STARTED, TASK_STATUS_PROPERTY } from '@/services/task-events.js';

/** 持ち越しスキャンの再実行間隔 */
const DEFER_SCAN_INTERVAL_MS = 5 * 60 * 1000;

/** @type {boolean} initTasks 実行済みフラグ */
let tasksInitialized = false;
/** @type {boolean} 持ち越しスキャンの実行中フラグ（重複実行の抑止） */
let deferRunning = false;

/**
 * タスク操作のワークフローを提供するコンポーザブル
 * @returns {Object} タスク操作関数群
 */
export function useTasks() {
  const events = useEvents();
  const eventStore = useEventStore();
  const calendarStore = useCalendarStore();

  /**
   * 書き込み可能なカレンダー ID の集合を返す
   * @returns {Set<string>}
   */
  function writableCalendarIds() {
    return new Set(calendarStore.listWritableCalendars.map((/** @type {any} */ cal) => cal.id));
  }

  /**
   * タスクプロパティを現在のユーザーが変更できるかどうか
   * @param {HandyCalendarEvent} evt イベント
   * @returns {boolean}
   */
  function canEditTask(evt) {
    return canEditTaskProperties(evt, writableCalendarIds());
  }

  /**
   * タスク用 PATCH ボディを生成する。
   * ローカル保存モデルの tags は「PATCH に shared が含まれると orbitTags で再評価される」ため、
   * 既存タグを保持するよう同じ値を同送する（同値の再送は非主催者でも許容される）。
   * @param {HandyCalendarEvent} evt イベント
   * @param {Record<string, string>} props 変更する shared プロパティ
   * @returns {{extendedProperties: {shared: Record<string, string>}}} PATCH ボディ
   */
  function buildTaskPatch(evt, props) {
    /** @type {Record<string, string>} */
    const shared = { ...props };
    if (Array.isArray(evt?.tags) && evt.tags.length) shared[TAGS_SHARED_PROPERTY] = JSON.stringify(evt.tags);
    return { extendedProperties: { shared } };
  }

  /**
   * タスクのステータスを変更する
   * @param {HandyCalendarEvent} evt 対象のタスクイベント
   * @param {string} status 新しいステータス（既定値・カスタム文字列のいずれも可）
   * @returns {Promise<boolean>} 更新を実行したかどうか
   */
  async function setTaskStatus(evt, status) {
    if (!evt?.id || !canEditTask(evt)) return false;
    await events.updateEvent(evt.id, evt.calendarId, buildTaskPatch(evt, { [TASK_STATUS_PROPERTY]: normalizeTaskStatus(status) }));
    return true;
  }

  /**
   * 完了 ⇔ 未着手を切り替える（DateEventsView のチェックボックス用）
   * @param {HandyCalendarEvent} evt 対象のタスクイベント
   * @returns {Promise<boolean>} 更新を実行したかどうか
   */
  async function toggleTaskCompleted(evt) {
    return setTaskStatus(evt, isTaskCompleted(evt) ? TASK_STATUS_NOT_STARTED : TASK_STATUS_COMPLETED);
  }

  /**
   * 翌日持ち越し設定を変更する
   * @param {HandyCalendarEvent} evt 対象のタスクイベント
   * @param {boolean} isDeferred 持ち越すかどうか
   * @returns {Promise<boolean>} 更新を実行したかどうか
   */
  async function setTaskDeferred(evt, isDeferred) {
    if (!evt?.id || !canEditTask(evt)) return false;
    await events.updateEvent(evt.id, evt.calendarId, buildTaskPatch(evt, { [TASK_DEFERRED_PROPERTY]: isDeferred ? '1' : '0' }));
    return true;
  }

  /**
   * 終了日が過ぎた未完了タスクのうち「翌日へ持ち越す」設定のものを今日へ移す。
   * バックグラウンドで定期的に呼ばれる想定。オフライン時は操作キュー経由で後日同期される。
   * @returns {Promise<void>}
   */
  async function deferOverdueTasks() {
    if (deferRunning) return;
    deferRunning = true;
    try {
      const today = dayjs();
      const writable = writableCalendarIds();
      // オフラインキューに残っている操作の対象は、未反映の変更を巻き戻さないよう除外する
      const pendingEventIds = new Set(eventStore.pendingOperations.map((/** @type {any} */ operation) => operation.eventId ?? operation.localId));
      for (const evt of await getStoredEvents()) {
        if (pendingEventIds.has(evt.id)) continue;
        if (!canEditTaskProperties(evt, writable)) continue;
        const patch = buildTaskDeferralPatch(evt, today);
        if (!patch) continue;
        await events.updateEvent(evt.id, evt.calendarId, patch);
      }
    } finally {
      deferRunning = false;
    }
  }

  return {
    canEditTask,
    setTaskStatus,
    setTaskDeferred,
    toggleTaskCompleted,
    deferOverdueTasks,
  };
}

/**
 * タスク機能のバックグラウンド処理を開始する。
 * 期限切れタスクの持ち越しを起動時・定期・オンライン復帰時・表示復帰時に実行する。
 * アプリ起動時に一度だけ呼ぶ。
 * @returns {void}
 */
export function initTasks() {
  if (tasksInitialized || typeof window === 'undefined') return;
  tasksInitialized = true;
  const tasks = useTasks();
  void tasks.deferOverdueTasks();
  window.setInterval(() => void tasks.deferOverdueTasks(), DEFER_SCAN_INTERVAL_MS);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void tasks.deferOverdueTasks();
  });
  window.addEventListener('online', () => void tasks.deferOverdueTasks());
}
