/**
 * カレンダー設定画面の読み込み・保存・削除ワークフローを担うコンポーザブル。
 * 権限に応じた更新対象の振り分けとストアへの反映をここに集約する。
 */
import { useCalendars } from '@/composables/useCalendars.js';
import { useCalendarStore } from '@/stores/calendar.js';
import { useUserStore } from '@/stores/user.js';

/**
 * @typedef {Object} CalendarDetailForm
 * @property {string} summary カレンダー名
 * @property {string} description 説明
 * @property {string} location 場所
 * @property {string} timeZone タイムゾーン
 * @property {string} colorId 色 ID
 */

/**
 * カレンダー設定ワークフローを提供するコンポーザブル
 * @returns {Object} カレンダー設定関数群
 */
export function useCalendarDetail() {
  const calendars = useCalendars();
  const calendarStore = useCalendarStore();
  const userStore = useUserStore();

  /**
   * カレンダー詳細（リストエントリとカレンダー本体）を取得する
   * @param {string} calendarId カレンダー ID
   * @param {GoogleCalendarListEntry|null} fallbackEntry API で取得できない場合に使うストア上のエントリ
   * @returns {Promise<{listEntry: GoogleCalendarListEntry|null, calendar: GoogleCalendarResource|null}>}
   */
  async function loadCalendarDetail(calendarId, fallbackEntry = null) {
    userStore.setLoading(true, 'Loading the calendar...');
    try {
      const [listEntry, calendar] = await Promise.all([calendars.fetchCalendarListEntry(calendarId).catch(() => null), calendars.fetchCalendarResource(calendarId).catch(() => null)]);
      return { listEntry: listEntry ?? fallbackEntry, calendar };
    } catch (err) {
      userStore.setError(true, err);
      return { listEntry: null, calendar: null };
    } finally {
      userStore.setLoading(false);
    }
  }

  /**
   * カレンダーの設定を保存する。オーナーは本体とリストエントリを、
   * 共有相手は自分のリストエントリのみ更新する。
   * @param {string} calendarId カレンダー ID
   * @param {CalendarDetailForm} form フォームの入力内容
   * @param {{isOwner: boolean, canEdit: boolean}} permissions 権限情報
   * @param {GoogleCalendarListEntry|null} currentEntry 現在のリストエントリ
   * @returns {Promise<GoogleCalendarResource|null>} 更新されたカレンダー本体
   */
  async function saveCalendarDetail(calendarId, form, { isOwner, canEdit }, currentEntry) {
    userStore.setLoading(true, 'Saving the calendar settings...');
    try {
      const newListEntry = await calendars.updateCalendarListEntry(calendarId, {
        colorId: form.colorId,
        ...(!isOwner ? { summaryOverride: form.summary.trim() } : {}),
      });

      let newCalendar = null;
      if (canEdit) {
        newCalendar = await calendars.updateCalendarResource(calendarId, {
          summary: form.summary.trim(),
          description: form.description.trim(),
          location: form.location.trim(),
          timeZone: form.timeZone,
        });
      }
      const entry = currentEntry ?? newListEntry;
      if (!entry) throw new Error('The selected calendar could not be found.');
      calendarStore.updateCalendar({
        ...entry,
        ...(newListEntry ?? {}),
        id: calendarId,
        summary: isOwner ? form.summary.trim() : (newListEntry?.summaryOverride ?? form.summary.trim()),
        ...(isOwner ? { summaryOverride: undefined } : { summaryOverride: form.summary.trim() }),
        colorId: newListEntry?.colorId ?? form.colorId,
        backgroundColor: newListEntry?.backgroundColor,
        foregroundColor: newListEntry?.foregroundColor,
      });
      return newCalendar;
    } catch (err) {
      userStore.setError(true, err);
      return null;
    } finally {
      userStore.setLoading(false);
    }
  }

  /**
   * カレンダー自体、または自分のカレンダーリストから対象を削除する
   * @param {string} calendarId カレンダー ID
   * @param {boolean} deleteItself true ならカレンダー自体を削除、false ならリストから除去
   * @returns {Promise<boolean>} 削除を実行したかどうか
   */
  async function removeCalendarWithConfirm(calendarId, deleteItself) {
    const message = deleteItself ? 'このカレンダー自体を削除します. 予定や共有設定も利用できなくなります. 実行しますか？' : 'このカレンダーを自分のカレンダーリストから削除しますか？';
    const confirmed = await userStore.confirm({
      title: deleteItself ? 'カレンダーを削除' : 'カレンダーリストから削除',
      message,
    });
    if (!confirmed) return false;

    userStore.setLoading(true, deleteItself ? 'Deleting the calendar...' : 'Removing the calendar from your list...');
    try {
      await calendars.deleteCalendar(calendarId, { deleteResource: deleteItself });
      return true;
    } catch (err) {
      userStore.setError(true, err);
      return false;
    } finally {
      userStore.setLoading(false);
    }
  }

  return { loadCalendarDetail, saveCalendarDetail, removeCalendarWithConfirm };
}
