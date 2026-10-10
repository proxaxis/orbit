/**
 * イベントフォームの送信ワークフローを担うコンポーザブル。
 * 作成・更新・写真アルバム紐づけ・画面遷移をここに集約する。
 */
import { useRouter } from 'vue-router';
import { useEvents } from '@/composables/useEvents.js';
import { usePhotos } from '@/composables/usePhotos.js';
import { useUserStore } from '@/stores/user.js';
import { TAGS_SHARED_PROPERTY } from '@/services/event-tags.js';

/**
 * @typedef {Object} EventSubmitPayload
 * @property {Record<string, any>} body イベント作成/更新のリクエストボディ
 * @property {string} [calendarId] イベントを作成するカレンダー（作成時）
 * @property {GoogleCalendarAttendee[]} [attendees] フォームで指定された参加者
 * @property {boolean} [createPhotoAlbum] 写真共有アルバムを作成するか
 */

/**
 * イベントフォームの送信ワークフローを提供するコンポーザブル
 * @returns {Object} 送信関数群
 */
export function useEventSubmit() {
  const router = useRouter();
  const events = useEvents();
  const photos = usePhotos();
  const userStore = useUserStore();

  /**
   * 保存後の後処理（アルバム作成・画面遷移）
   * @param {HandyCalendarEvent|null} event 保存されたイベント
   * @param {EventSubmitPayload} payload フォームの送信内容
   * @param {Promise<HandyCalendarEvent|null>} [synced] サーバ同期の完了を追跡する Promise（アルバム作成はこの完了を待つ）
   * @returns {Promise<void>}
   */
  async function afterSubmit(event, payload, synced = null) {
    const { body, attendees = [], createPhotoAlbum = false } = payload;
    userStore.rememberEventTitle(body.summary);
    // 保存に使われたタグを候補キャッシュへ記録する
    const savedTags = body.extendedProperties?.shared?.[TAGS_SHARED_PROPERTY];
    if (savedTags) {
      try {
        userStore.rememberEventTags(JSON.parse(savedTags));
      } catch {
        // タグ履歴の記録失敗は保存処理を妨げない
      }
    }
    // 詳細画面が新しいイベントを表示できるよう選択状態を更新する（複製・作成時）
    if (event) userStore.setNowSelectedEvent({ eid: event.id, cid: event.calendarId });
    if (createPhotoAlbum && event) {
      // アルバム作成にはサーバ側のイベント ID が必要なため、バックグラウンド同期の
      // 完了を待ってから実行する。イベントの保存自体は完了しているため、
      // アルバム作成の失敗はエラー表示だけに留める
      void (async () => {
        try {
          const saved = (await synced) ?? event;
          if (!saved || String(saved.id).startsWith('offline-')) throw new Error('イベントのサーバ同期が完了していないためアルバムを作成できませんでした');
          await photos.ensureEventAlbum(photos.applySubmitBody(saved, { ...body, attendees }));
        } catch (albumError) {
          userStore.setError(true, albumError);
        }
      })();
    }
    router.push({ name: 'EventDetail' });
  }

  /**
   * イベントを作成する。ローカル保存が完了したら即座に画面遷移し、
   * サーバ同期はバックグラウンド（Web Worker）に委譲する。
   * @param {EventSubmitPayload} payload フォームの送信内容
   * @returns {Promise<void>}
   */
  async function submitCreate(payload) {
    const { body, calendarId } = payload;
    userStore.setLoading(true, 'Creating event...');
    try {
      const { event, synced } = await events.createEvent(body, calendarId ?? '');
      if (!event) throw new Error('Failed to create event. No event returned.');
      await afterSubmit(event, payload, synced);
    } catch (err) {
      userStore.setError(true, err);
    } finally {
      userStore.setLoading(false);
    }
  }

  /**
   * 選択中のイベントを更新する
   * @param {EventSubmitPayload} payload フォームの送信内容
   * @param {HandyCalendarEvent|null} originalEvent 更新前のイベント（アルバム名の更新用）
   * @returns {Promise<void>}
   */
  async function submitUpdate(payload, originalEvent = null) {
    try {
      if (!userStore.nowSelectedEvent) throw new Error('You do not have an event selected. You must select an event to update it.');
      userStore.setLoading(true, 'Updating the event...');
      await events.updateEvent(userStore.nowSelectedEvent.eid, userStore.nowSelectedEvent.cid, payload.body);
      await afterSubmit(originalEvent, payload);
    } catch (err) {
      userStore.setError(true, err);
    } finally {
      userStore.setLoading(false);
    }
  }

  /**
   * 選択中のイベントを読み込む
   * @returns {Promise<HandyCalendarEvent|null>} 読み込んだイベント
   */
  async function loadEditingEvent() {
    try {
      if (!userStore.nowSelectedEvent) throw new Error('You do not have an event selected. You must select an event to edit it.');
      userStore.setLoading(true, 'Loading the event...');
      const result = await events.getEventById(userStore.nowSelectedEvent.eid, userStore.nowSelectedEvent.cid);
      if (!result) throw new Error('The event could not be found. Go back to the calendar and select a different event.');
      return result;
    } catch (err) {
      userStore.setError(true, err);
      return null;
    } finally {
      userStore.setLoading(false);
    }
  }

  return { submitCreate, submitUpdate, loadEditingEvent };
}
