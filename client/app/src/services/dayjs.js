import dayjs from 'dayjs';
import 'dayjs/locale/ja';

dayjs.locale('ja');

/**
 * 日付を dayjs オブジェクトに変換
 * @param {number|string|Date|dayjs.Dayjs} [arg1] 年、日付文字列、Date オブジェクト、または dayjs オブジェクト
 * @param {number} [arg2] 月インデックス (0~11)
 * @param {number} [arg3] 日
 * @returns {dayjs.Dayjs}
 */
export function toDayjs(arg1 = undefined, arg2 = undefined, arg3 = undefined) {
  // 引数がすべて undefined の場合、現在の日付を返す
  if (arg1 === undefined && arg2 === undefined && arg3 === undefined) {
    return dayjs();
  }
  // 数値 3 つ (year, month, day) の場合
  else if (typeof arg1 === 'number' && typeof arg2 === 'number' && typeof arg3 === 'number') {
    return dayjs(new Date(arg1, arg2, arg3));
  }
  // 文字列の場合
  else if (typeof arg1 === 'string') {
    return dayjs(arg1);
  }
  // dayjs オブジェクトの場合
  else if (dayjs.isDayjs(arg1)) {
    return arg1;
  }
  // Date オブジェクトの場合
  else if (arg1 instanceof Date) {
    return dayjs(arg1);
  }

  throw new TypeError('無効な引数: toDayjs(year, month, day) または toDayjs("YYYY-MM-DD") または toDayjs(date) を指定してください');
}

/**
 * 指定した日付とイベントの時間帯が重なっているか判定
 * @param {{startDateTime?: dayjs.Dayjs, endDateTime?: dayjs.Dayjs}} evt イベントの開始日時と終了日時を持つオブジェクト
 * @param {dayjs.Dayjs} date 判定する日付
 * @returns {boolean} 重なっているかどうか
 */
export function isEventOnDate({ startDateTime, endDateTime }, date) {
  const eventStart = toDayjs(startDateTime);
  const eventEnd = toDayjs(endDateTime);
  const dateStart = date.startOf('day');
  const dateEnd = dateStart.add(1, 'day');

  return eventStart.isBefore(dateEnd) && eventEnd.isAfter(dateStart);
}

export default dayjs;
