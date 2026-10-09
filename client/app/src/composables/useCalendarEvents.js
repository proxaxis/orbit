/**
 * カレンダービュー向けのイベント購読ロジック。
 * ビューは表示範囲（Dayjs の start/end）を渡すだけで、fetch・キャッシュ・再読み込みは
 * すべてここがバックグラウンドで担う。UI 側で await しないため描画はブロックされない。
 * 月単位のイベントキャッシュはモジュールスコープで共有し、複数ビューで重複取得しない。
 */
import { computed, ref, watch } from 'vue';
import { useEvents } from '@/composables/useEvents.js';
import { useCalendarStore } from '@/stores/calendar.js';
import { useEventStore } from '@/stores/event.js';
import { isCustomHolidayEvent, holidayDatesOf } from '@/services/custom-holidays.js';

/** @type {Ref<Map<string, HandyCalendarEvent[]>>} "年:月" ごとのイベントキャッシュ（表示中カレンダー分を結合済み） */
const monthEvents = ref(new Map());

/** @type {Map<string, Promise<void>>} 読み込み中の年月（重複 fetch 抑止用） */
const inflightMonths = new Map();

/** @type {number} キャッシュ破棄ごとに増える世代番号。破棄前に開始した取得結果がキャッシュを再汚染するのを防ぐ */
let cacheGeneration = 0;

/** モジュール共有の月イベントキャッシュを全て破棄する（アカウント切替時などに使用） */
export function resetSharedEventCache() {
  monthEvents.value = new Map();
  cacheGeneration += 1;
}

/**
 * 指定範囲にかかるイベントを購読するコンポーザブル。
 * カスタム休日（'Custom Holiday' 終日イベント）は通常イベントとしては返さず、
 * `customHolidayDates`（休日対象の日付キー一覧）として別途公開する。
 * @param {ComputedRef<{start: Dayjs, end: Dayjs}>} range 表示範囲（start/end はその日を含む）
 * @returns {{events: ComputedRef<HandyCalendarEvent[]>, customHolidays: ComputedRef<HandyCalendarEvent[]>, customHolidayDates: ComputedRef<Set<string>>}}
 */
export function useCalendarEvents(range) {
  const eventsService = useEvents();
  const calendarStore = useCalendarStore();
  const eventStore = useEventStore();

  // 表示範囲がまたぐ月に前後1か月のバッファを付けて取得・併合する。
  // 範囲外の月エントリにも範囲内のイベントが含まれ得る（月またぎ・月単位キャッシュのずれ）ため、
  // 1エントリだけの欠落で表示が崩れないようにする
  const neededMonths = computed(() => {
    const months = [];
    const fetchStart = range.value.start.startOf('month').subtract(1, 'month');
    const fetchEnd = range.value.end.endOf('month').add(1, 'month');
    for (let cursor = fetchStart; !cursor.isAfter(fetchEnd); cursor = cursor.add(1, 'month')) {
      months.push({ year: cursor.year(), month: cursor.month(), key: `${cursor.year()}:${cursor.month()}` });
    }
    return months;
  });

  /**
   * 指定月のイベントをバックグラウンドで読み込んで共有キャッシュへ入れる
   * @param {{year: number, month: number, key: string}} target 対象の月
   * @param {{force?: boolean}} [options={}] force 時はキャッシュ済みでも再取得する
   * @returns {void}
   */
  function loadMonth(target, { force = false } = {}) {
    if (!force && monthEvents.value.has(target.key)) return;
    if (inflightMonths.has(target.key)) return;
    const generation = cacheGeneration;
    const task = eventsService
      .listEvents(target.year, target.month)
      .then((items) => {
        // 取得中にキャッシュが破棄された場合は古い世代の結果を書き戻さない
        if (generation !== cacheGeneration) return;
        const next = new Map(monthEvents.value);
        next.set(target.key, items);
        monthEvents.value = next;
      })
      .catch(() => {
        // 失敗した月はキャッシュに残さず遅延リトライする（放っておくと範囲が変わるまで空のままになる）
        window.setTimeout(() => loadMonth(target), 30_000);
      })
      .finally(() => {
        inflightMonths.delete(target.key);
        // 世代が変わった＝リセット/強制再取得待ち → 取り直す（inflight スキップ分の補填。
        // 旧エントリが残る場合があるため force で必ず上書きする）
        if (generation !== cacheGeneration) loadMonth(target, { force: true });
      });
    inflightMonths.set(target.key, task);
  }

  /** 表示範囲のうち未取得の月だけを読み込む */
  function loadNeededMonths() {
    neededMonths.value.forEach((target) => loadMonth(target));
  }

  /** 予定データの変更を反映するため、表示中の月を全て再取得する */
  function reloadNeededMonths() {
    // 世代を進めて実行中の古い取得を無効化し、完了時に取り直させる
    cacheGeneration += 1;
    neededMonths.value.forEach((target) => loadMonth(target, { force: true }));
  }

  // 表示範囲が変わったら不足分だけ読み込む（キー文字列で実質変更のみに反応させる）
  watch(() => neededMonths.value.map((target) => target.key).join(','), loadNeededMonths, { immediate: true });

  // 予定の作成・更新・削除・オフライン同期完了で再取得する
  watch(() => eventStore.eventsVersion, reloadNeededMonths);

  // 表示中のカレンダー構成が変わったらキャッシュを破棄して取り直す
  // （カレンダー別月キャッシュも破棄しないと古い月エントリが再利用される）
  watch(
    () => calendarStore.listVisibleCalendars,
    () => {
      eventStore.clearEventCache();
      resetSharedEventCache();
      loadNeededMonths();
    },
    { deep: true },
  );

  /** @type {ComputedRef<HandyCalendarEvent[]>} 表示範囲に重なる全イベント（カスタム休日を含む） */
  const allEvents = computed(() => {
    const { start, end } = range.value;
    /** @type {Map<string, HandyCalendarEvent>} */
    const merged = new Map();
    for (const target of neededMonths.value) {
      for (const evt of monthEvents.value.get(target.key) ?? []) {
        if (!evt.startDateTime.isBefore(end) || !evt.endDateTime.isAfter(start)) continue;
        // 月ごとの取得結果に同一イベントの新旧コピーが混在し得るため、updated が新しい方を採用する
        const key = `${evt.calendarId}:${evt.id}`;
        const existing = merged.get(key);
        if (!existing || String(evt.raw?.updated ?? '') >= String(existing.raw?.updated ?? '')) merged.set(key, evt);
      }
    }
    return [...merged.values()];
  });

  /** @type {ComputedRef<HandyCalendarEvent[]>} 表示用イベント一覧（カスタム休日を除く） */
  const events = computed(() => allEvents.value.filter((evt) => !isCustomHolidayEvent(evt)));

  /** @type {ComputedRef<HandyCalendarEvent[]>} 表示範囲内のカスタム休日イベント */
  const customHolidays = computed(() => allEvents.value.filter((evt) => isCustomHolidayEvent(evt)));

  /** @type {ComputedRef<Set<string>>} カスタム休日が設定された日付キー（YYYY-MM-DD）の集合 */
  const customHolidayDates = computed(() => {
    /** @type {Set<string>} */
    const dates = new Set();
    for (const evt of customHolidays.value) {
      for (const dateKey of holidayDatesOf(evt)) dates.add(dateKey);
    }
    return dates;
  });

  return { events, customHolidays, customHolidayDates };
}
