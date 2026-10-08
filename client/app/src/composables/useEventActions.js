/**
 * イベント詳細・一覧から呼ばれるイベント操作ワークフローのコンポーザブル。
 * 確認ダイアログ・ローディング表示・エラー通知と CRUD の組み合わせをここに集約する。
 */
import dayjs from '@/services/dayjs.js';
import { useEvents } from '@/composables/useEvents.js';
import { useUserStore } from '@/stores/user.js';

/**
 * イベント操作ワークフローを提供するコンポーザブル
 * @returns {Object} 操作ワークフロー関数群
 */
export function useEventActions() {
  const events = useEvents();
  const userStore = useUserStore();

  /**
   * 確認ダイアログを表示してからイベントを削除する
   * @param {string} eventId イベント ID
   * @param {string} calendarId カレンダー ID
   * @returns {Promise<boolean>} 削除を実行したかどうか
   */
  async function confirmAndRemoveEvent(eventId, calendarId) {
    if (!eventId || !calendarId) throw new Error('You do not have an event selected. You must select an event to remove it.');
    if (!(await userStore.confirm({ title: 'イベントの削除', message: '本当にこのイベントを削除しますか？' }))) return false;
    userStore.setLoading(true, 'Removing the event...');
    try {
      const res = await events.removeEvent(eventId, calendarId);
      if (!res) throw new Error('Failed to remove the event.');
      return true;
    } catch (err) {
      userStore.setError(true, err);
      return false;
    } finally {
      userStore.setLoading(false);
    }
  }

  /**
   * 自分の出席ステータスを更新する
   * @param {HandyCalendarEvent} event 対象イベント
   * @param {string} responseStatus 応答ステータス（accepted / declined / tentative / needsAction）
   * @returns {Promise<boolean>} 更新に成功したかどうか
   */
  async function respondToEvent(event, responseStatus) {
    const attendees = (event.raw?.attendees ?? []).map((attendee) => (attendee.self ? { ...attendee, responseStatus } : attendee));
    userStore.setLoading(true, responseStatus === 'accepted' ? '承諾しています...' : '辞退しています...');
    try {
      await events.updateEvent(event.id, event.calendarId, { attendees });
      if (event.raw) event.raw = { ...event.raw, attendees };
      return true;
    } catch (err) {
      userStore.setError(true, err);
      return false;
    } finally {
      userStore.setLoading(false);
    }
  }

  /**
   * イベントを読み込む。選択中のイベントが無ければクエリから復元する。
   * @param {{eid?: string, cid?: string}} [query] ルートクエリのイベント指定
   * @returns {Promise<HandyCalendarEvent|null>} 読み込んだイベント
   */
  async function loadSelectedEvent(query = {}) {
    if (!userStore.nowSelectedEvent && typeof query.eid === 'string' && typeof query.cid === 'string') {
      userStore.setNowSelectedEvent({ eid: query.eid, cid: query.cid });
    }
    userStore.setLoading(true, 'Loading the event...');
    try {
      if (!userStore.nowSelectedEvent) throw new Error('You do not have an event selected. You must select an event to view its details.');
      return await events.getEventById(userStore.nowSelectedEvent.eid, userStore.nowSelectedEvent.cid);
    } catch (err) {
      userStore.setError(true, err);
      return null;
    } finally {
      userStore.setLoading(false);
    }
  }

  /**
   * イベントの日時を表示用文字列に変換する
   * @param {HandyCalendarEvent|null} evt イベント
   * @returns {{ startText?: string, endText?: string, inlineText?: string }} 日付の文字列
   */
  function eventDateText(evt) {
    if (!evt) return {};
    const now = dayjs();
    let startText = undefined,
      endText = undefined,
      inlineText = undefined;
    // 終日イベントの場合
    if (evt.isAllDay) {
      if (evt.startDateTime.isSame(evt.endDateTime.subtract(1, 'day'), 'day')) {
        inlineText = '終日';
      } else if (evt.startDateTime.isSame(evt.endDateTime.subtract(1, 'day'), 'month')) {
        startText = evt.startDateTime.format('YYYY年 M月 D日 (ddd)');
        endText = dayjs(evt.endDateTime).subtract(1, 'day').format('DD日 (ddd)');
      } else if (evt.startDateTime.isSame(evt.endDateTime.subtract(1, 'day'), 'year')) {
        startText = evt.startDateTime.format('YYYY年 M月 D日 (ddd)');
        endText = evt.endDateTime.subtract(1, 'day').format('M月 D日 (ddd)');
      } else {
        startText = evt.startDateTime.format('YYYY年 M月 D日 (ddd)');
        endText = evt.endDateTime.subtract(1, 'day').format('YYYY年 M月 D日 (ddd)');
      }
    }
    // 時間指定イベントの場合
    else {
      if (evt.startDateTime.isSame(evt.endDateTime, 'day')) {
        startText = evt.startDateTime.format('HH:mm');
        endText = evt.endDateTime.format('HH:mm');
      } else if (evt.startDateTime.isSame(evt.endDateTime.subtract(1, 'day'), 'month')) {
        startText = evt.startDateTime.format('M月 D日 (ddd) HH:mm');
        endText = evt.endDateTime.subtract(1, 'day').format('D日 (ddd) HH:mm');
      } else if (evt.startDateTime.isSame(evt.endDateTime.subtract(1, 'day'), 'year')) {
        startText = evt.startDateTime.format('YYYY年 M月 D日 (ddd) HH:mm');
        endText = evt.endDateTime.subtract(1, 'day').format('M月 D日 (ddd) HH:mm');
      } else {
        startText = evt.startDateTime.format('YYYY年 M月 D日 (ddd) HH:mm');
        endText = evt.endDateTime.subtract(1, 'day').format('YYYY年 M月 D日 (ddd) HH:mm');
      }
    }

    // 日付の文字列から、今日、今月、今週の部分を削除
    const regex = new RegExp(`^(${now.format('YYYY年')}|${now.format('YYYY年 M月')}|${now.format('M月')}|${now.format('D日 (ddd)')})`, 'g');
    startText = startText?.replace(regex, '').trim();
    endText = endText?.replace(regex, '').trim();
    return { startText, endText, inlineText };
  }

  /**
   * 自分以外の参加者がいるかどうか
   * @param {HandyCalendarEvent} evt イベント
   * @returns {boolean}
   */
  function hasOtherAttendees(evt) {
    return evt.raw?.attendees?.some((/** @type {any} */ attendee) => !attendee.self) ?? false;
  }

  return {
    confirmAndRemoveEvent,
    respondToEvent,
    loadSelectedEvent,
    eventDateText,
    hasOtherAttendees,
  };
}
