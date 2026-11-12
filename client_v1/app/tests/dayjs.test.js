import { describe, expect, it } from 'vitest';
import dayjs, { isEventOnDate, toDayjs } from '@/services/dayjs.js';

describe('toDayjs', () => {
  it('引数なしで現在日時を返す', () => {
    const result = toDayjs();
    expect(dayjs.isDayjs(result)).toBe(true);
    expect(Math.abs(result.diff(dayjs(), 'second'))).toBeLessThanOrEqual(1);
  });

  it('(year, monthIndex, day) 数値3つで日付を返す', () => {
    const result = toDayjs(2026, 9, 6);
    expect(result.format('YYYY-MM-DD')).toBe('2026-10-06');
  });

  it('文字列をパースする', () => {
    expect(toDayjs('2026-03-15').format('YYYY-MM-DD')).toBe('2026-03-15');
  });

  it('dayjs オブジェクトはそのまま返す', () => {
    const input = dayjs('2026-01-01');
    expect(toDayjs(input)).toBe(input);
  });

  it('Date オブジェクトを変換する', () => {
    expect(toDayjs(new Date(2026, 0, 20)).format('YYYY-MM-DD')).toBe('2026-01-20');
  });

  it('不正な引数で TypeError を投げる', () => {
    expect(() => toDayjs(2026)).toThrow(TypeError);
    expect(() => toDayjs(null)).toThrow(TypeError);
  });
});

describe('isEventOnDate', () => {
  const date = dayjs('2026-10-06');

  it('当日のイベントは true', () => {
    expect(isEventOnDate({ startDateTime: dayjs('2026-10-06T10:00'), endDateTime: dayjs('2026-10-06T11:00') }, date)).toBe(true);
  });

  it('前日・翌日のみのイベントは false', () => {
    expect(
      isEventOnDate({ startDateTime: dayjs('2026-10-05T10:00'), endDateTime: dayjs('2026-10-05T11:00') }, date),
    ).toBe(false);
    expect(
      isEventOnDate({ startDateTime: dayjs('2026-10-07T10:00'), endDateTime: dayjs('2026-10-07T11:00') }, date),
    ).toBe(false);
  });

  it('日跨ぎイベントは両日で true', () => {
    const evt = { startDateTime: dayjs('2026-10-05T22:00'), endDateTime: dayjs('2026-10-06T02:00') };
    expect(isEventOnDate(evt, dayjs('2026-10-05'))).toBe(true);
    expect(isEventOnDate(evt, date)).toBe(true);
    expect(isEventOnDate(evt, dayjs('2026-10-07'))).toBe(false);
  });

  it('終了が日の開始ちょうどのイベントはその日に含まない', () => {
    const evt = { startDateTime: dayjs('2026-10-05T10:00'), endDateTime: dayjs('2026-10-06T00:00') };
    expect(isEventOnDate(evt, dayjs('2026-10-05'))).toBe(true);
    expect(isEventOnDate(evt, date)).toBe(false);
  });
});
