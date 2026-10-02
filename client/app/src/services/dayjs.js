import dayjs from 'dayjs';
import 'dayjs/locale/ja';

dayjs.locale('ja');

/**
 * 日付を dayjs オブジェクトに変換
 * @param {number|string|Date} [arg1] 年、日付文字列、または Date オブジェクト
 * @param {number} [arg2] 月インデックス (0~11)
 * @param {number} [arg3] 日
 * @returns {dayjs.Dayjs}
 */
export function toDayjs(arg1 = undefined, arg2 = undefined, arg3 = undefined) {
  // 1. 数値 3 つ (year, month, day) の場合
  if (typeof arg1 === 'number' && typeof arg2 === 'number' && typeof arg3 === 'number') {
    const month = String(arg2 + 1).padStart(2, '0'); // 月インデックスを 1~12 に変換
    const day = String(arg3).padStart(2, '0');
    return dayjs(`${arg1}-${month}-${day}`);
  }
  // 2. 文字列の場合
  else if (typeof arg1 === 'string') {
    return dayjs(arg1);
  }
  // 3. Date オブジェクトの場合
  else if (arg1 instanceof Date) {
    return dayjs(arg1);
  }

  throw new TypeError('無効な引数: toDayjs(year, month, day) または toDayjs("YYYY-MM-DD") または toDayjs(date) を指定してください');
}

export default dayjs;
