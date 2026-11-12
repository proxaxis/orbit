import { describe, expect, it } from 'vitest';
import { buildRecurrence, parseRecurrence, moveToNextWeekday, moveToPreviousWeekday, HOLIDAY_ADJUSTMENT_PROPERTY } from '@/services/rrule.js';

describe('buildRecurrence', () => {
  it('基本の RRULE を生成する', () => {
    const { recurrence, shared } = buildRecurrence({ frequency: 'WEEKLY', weekdays: ['MO', 'WE'] });
    expect(recurrence).toEqual(['RRULE:FREQ=WEEKLY;BYDAY=MO,WE']);
    expect(shared).toEqual({});
  });

  it('interval / count / until を含める', () => {
    const { recurrence } = buildRecurrence({ frequency: 'DAILY', interval: 2, until: '2026-12-31', isAllDay: true });
    expect(recurrence[0]).toBe('RRULE:FREQ=DAILY;INTERVAL=2;UNTIL=20261231');
  });

  it('終日でない場合 UNTIL に時刻を付ける', () => {
    const { recurrence } = buildRecurrence({ frequency: 'DAILY', until: '2026-12-31', isAllDay: false });
    expect(recurrence[0]).toBe('RRULE:FREQ=DAILY;UNTIL=20261231T235959Z');
  });

  it('COUNT 指定時は UNTIL を無視する', () => {
    const { recurrence } = buildRecurrence({ frequency: 'WEEKLY', count: 5, until: '2026-12-31' });
    expect(recurrence[0]).toBe('RRULE:FREQ=WEEKLY;COUNT=5');
  });

  it('不正な frequency では recurrence を返さない', () => {
    const { recurrence, shared } = buildRecurrence({ frequency: 'HOURLY' });
    expect(recurrence).toBeUndefined();
    expect(shared).toEqual({});
  });

  it('MONTHLY の BYMONTHDAY と YEARLY の BYMONTH', () => {
    expect(buildRecurrence({ frequency: 'MONTHLY', monthDay: 15 }).recurrence[0]).toBe('RRULE:FREQ=MONTHLY;BYMONTHDAY=15');
    expect(buildRecurrence({ frequency: 'YEARLY', month: 4 }).recurrence[0]).toBe('RRULE:FREQ=YEARLY;BYMONTH=4');
  });

  it('BYMONTHDAY / BYMONTH を範囲内に丸める', () => {
    expect(buildRecurrence({ frequency: 'MONTHLY', monthDay: 99 }).recurrence[0]).toBe('RRULE:FREQ=MONTHLY;BYMONTHDAY=31');
    expect(buildRecurrence({ frequency: 'YEARLY', month: 99 }).recurrence[0]).toBe('RRULE:FREQ=YEARLY;BYMONTH=12');
  });

  it('終日の除外日を EXDATE として出力する', () => {
    const { recurrence } = buildRecurrence({ frequency: 'DAILY', isAllDay: true, exclusions: ['2026-10-10', '2026-10-05'] });
    expect(recurrence[1]).toBe('EXDATE;VALUE=DATE:20261005,20261010');
  });

  it('時間指定の除外日は開始時刻を使う', () => {
    const { recurrence } = buildRecurrence({
      frequency: 'DAILY',
      isAllDay: false,
      startDateTime: '2026-10-01T09:30:00',
      timeZone: 'Asia/Tokyo',
      exclusions: ['2026-10-10'],
    });
    expect(recurrence[1]).toBe('EXDATE;TZID=Asia/Tokyo:20261010T093000');
  });

  it('holidayAdjustment は shared プロパティへ入る', () => {
    const { shared } = buildRecurrence({ frequency: 'WEEKLY', holidayAdjustment: 'NEXT_WEEKDAY' });
    expect(shared[HOLIDAY_ADJUSTMENT_PROPERTY]).toBe('NEXT_WEEKDAY');
  });
});

describe('parseRecurrence', () => {
  it('buildRecurrence とのラウンドトリップ', () => {
    const { recurrence, shared } = buildRecurrence({
      frequency: 'WEEKLY',
      interval: 2,
      weekdays: ['TU', 'TH'],
      count: 8,
      exclusions: ['2026-10-08'],
      isAllDay: true,
      holidayAdjustment: 'PREV_WEEKDAY',
    });
    const parsed = parseRecurrence(recurrence, shared);
    expect(parsed).toMatchObject({
      frequency: 'WEEKLY',
      interval: 2,
      weekdays: ['TU', 'TH'],
      count: 8,
      exclusions: ['2026-10-08'],
      holidayAdjustment: 'PREV_WEEKDAY',
    });
  });

  it('UNTIL を YYYY-MM-DD に戻す', () => {
    const parsed = parseRecurrence(['RRULE:FREQ=DAILY;UNTIL=20261231T235959Z']);
    expect(parsed.until).toBe('2026-12-31');
  });

  it('recurrence なしの場合は空の設定を返す', () => {
    const parsed = parseRecurrence();
    expect(parsed.frequency).toBe('');
    expect(parsed.interval).toBe(1);
    expect(parsed.weekdays).toEqual([]);
  });
});

describe('休日調整', () => {
  // 2026-10-03 は土曜日
  it('moveToNextWeekday は週末を月曜へ送る', () => {
    expect(moveToNextWeekday('2026-10-03').format('YYYY-MM-DD')).toBe('2026-10-05');
  });

  it('moveToNextWeekday は祝日もスキップする', () => {
    // 10/5(月) が祝日なら 10/6(火)
    expect(moveToNextWeekday('2026-10-03', ['2026-10-05']).format('YYYY-MM-DD')).toBe('2026-10-06');
  });

  it('moveToPreviousWeekday は週末を金曜へ戻す', () => {
    expect(moveToPreviousWeekday('2026-10-04').format('YYYY-MM-DD')).toBe('2026-10-02');
  });
});
