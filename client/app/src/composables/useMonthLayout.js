/**
 * 月カレンダーのイベントバー配置ロジック。
 * 週単位でイベントをレーンに割り当て、日付キーごとの表示スロットを返す。
 * 月横表示ビュー（CalendarMonthHorizonView）と月縦スクロールビュー
 * （CalendarMonthVerticalView）で共有する。
 */

/**
 * @typedef {Object} MonthEventSlot
 * @property {HandyCalendarEvent} event 対象イベント
 * @property {boolean} isStart イベントバーの開始端かどうか
 * @property {boolean} isEnd イベントバーの終了端かどうか
 * @property {boolean} isLabelStart ラベルを表示する端かどうか
 * @property {number} spanDays ラベルがまたぐ日数
 */

/**
 * 日付配列を週単位に分割し、イベントを行（レーン）に配置したマップを構築する
 * @param {{date: Dayjs}[]} days 月グリッドの日付配列（7 の倍数）
 * @param {HandyCalendarEvent[]} events 表示範囲のイベント
 * @param {number} maxBars 1 セルに表示するイベントバーの最大数
 * @returns {Map<string, (MonthEventSlot|null)[]>} 日付キー（YYYY-MM-DD）ごとのスロット配列
 */
export function buildMonthLayout(days, events, maxBars) {
  /** @type {Map<string, (MonthEventSlot|null)[]>} */
  const map = new Map();
  const weeks = [];

  // 1週間ごとに分割
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }

  weeks.forEach((week, weekIndex) => {
    const weekStart = week[0].date;
    const weekEnd = week[week.length - 1].date.endOf('day');

    // この週に関係するイベントを抽出
    const weekEvents = Array.from(events)
      .filter((e) => e.startDateTime.isBefore(weekEnd) && e.endDateTime.isAfter(weekStart))
      .sort((a, b) => {
        // ソート: 開始日時順 > 期間が長い順
        if (a.startDateTime.unix() !== b.startDateTime.unix()) return a.startDateTime.unix() - b.startDateTime.unix();
        const durA = a.endDateTime.unix() - a.startDateTime.unix();
        const durB = b.endDateTime.unix() - b.startDateTime.unix();
        return durB - durA;
      });

    /** @type {boolean[][]} @description スロットの埋まり具合を管理する配列（例: slots[row][dayIndex]）*/
    const slots = [];

    weekEvents.forEach((evt) => {
      // 週内での開始・終了インデックスを計算 (0-6)
      let startIndex = 0;
      let endIndex = 6;

      // 開始日時が週の開始日より後であれば、開始インデックスを計算
      if (evt.startDateTime.isAfter(weekStart)) {
        startIndex = evt.startDateTime.diff(weekStart, 'day');
      }
      if (evt.endDateTime.isBefore(weekEnd)) {
        endIndex = evt.endDateTime.diff(weekStart, 'day');
        // 00:00終了の場合は前日までとする
        if (evt.endDateTime.hour() === 0 && evt.endDateTime.minute() === 0 && evt.endDateTime.isAfter(evt.startDateTime)) {
          endIndex -= 1;
        }
      }

      // 範囲外補正
      startIndex = Math.max(0, startIndex);
      endIndex = Math.min(6, endIndex);
      if (startIndex > endIndex) return;

      // 空いている行を探す
      let row = 0;
      if (maxBars <= 0) return;
      while (true) {
        if (row >= maxBars) return;
        if (!slots[row]) slots[row] = new Array(7).fill(false);
        let isFree = true;
        for (let i = startIndex; i <= endIndex; i++) {
          if (slots[row][i]) {
            isFree = false;
            break;
          }
        }
        if (isFree) break;
        row++;
      }

      // スロットを埋める
      for (let i = startIndex; i <= endIndex; i++) slots[row][i] = true;

      // マップに登録（各日のセルに表示情報を渡す）
      for (let i = 0; i < 7; i++) {
        const d = week[i];
        if (!d) continue;
        const key = d.date.format('YYYY-MM-DD');

        let daySlots = map.get(key);
        if (!daySlots) {
          daySlots = [];
          map.set(key, daySlots);
        }
        // 必要に応じて配列を拡張
        while (daySlots.length <= row) daySlots.push(null);

        // イベント表示範囲内であれば情報をセット
        if (i >= startIndex && i <= endIndex) {
          daySlots[row] = {
            event: evt,
            isStart: i === startIndex,
            isEnd: i === endIndex || (weekIndex === weeks.length - 1 && i === week.length - 1),
            isLabelStart: i === startIndex || i === 0,
            spanDays: i === startIndex || i === 0 ? endIndex - i + 1 : 1,
          };
        }
      }
    });
  });
  return map;
}
