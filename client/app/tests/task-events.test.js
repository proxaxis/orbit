import { describe, expect, it } from 'vitest';
import dayjs from '@/services/dayjs.js';
import {
  buildAllDayTaskDigestEntries,
  buildTaskDeferralPatch,
  buildTaskSharedProperties,
  canEditTaskProperties,
  isTaskCompleted,
  isTaskDeferred,
  isTaskEvent,
  normalizeTaskNotificationTimes,
  taskStatusOf,
  unfinishedTaskCountForDay,
} from '@/services/task-events.js';

/** タスクイベントのモックを作る */
function taskEvent(overrides = {}) {
  const shared = { orbitIsTask: '1', orbitTaskStatus: 'not-started', orbitTaskDeferred: '0', ...(overrides.shared ?? {}) };
  return {
    id: 'evt-1',
    calendarId: 'cal-1',
    summary: 'タスク',
    isAllDay: true,
    startDateTime: dayjs('2026-10-20'),
    endDateTime: dayjs('2026-10-21'),
    raw: { start: { date: '2026-10-20' }, end: { date: '2026-10-21' }, extendedProperties: { shared } },
    ...overrides.fields,
  };
}

describe('isTaskEvent / taskStatusOf / isTaskDeferred / isTaskCompleted', () => {
  it('shared 拡張プロパティからタスクを判定する', () => {
    expect(isTaskEvent(taskEvent())).toBe(true);
    expect(isTaskEvent({ raw: {} })).toBe(false);
    expect(isTaskEvent({ raw: { extendedProperties: { shared: { orbitIsTask: '0' } } } })).toBe(false);
    expect(isTaskEvent({ extendedProperties: { shared: { orbitIsTask: 'true' } } })).toBe(true);
  });

  it('ステータスを読み取り、未設定・空なら not-started', () => {
    expect(taskStatusOf(taskEvent({ shared: { orbitTaskStatus: 'in-progress' } }))).toBe('in-progress');
    expect(taskStatusOf(taskEvent({ shared: { orbitTaskStatus: '  ' } }))).toBe('not-started');
    expect(taskStatusOf(taskEvent({ shared: { orbitTaskStatus: 'レビュー待ち' } }))).toBe('レビュー待ち');
    expect(isTaskCompleted(taskEvent({ shared: { orbitTaskStatus: 'completed' } }))).toBe(true);
    expect(isTaskDeferred(taskEvent({ shared: { orbitTaskDeferred: '1' } }))).toBe(true);
    expect(isTaskDeferred(taskEvent({ shared: { orbitTaskDeferred: '0' } }))).toBe(false);
  });
});

describe('buildTaskSharedProperties', () => {
  it('タスクの shared 拡張プロパティ一式を生成する', () => {
    expect(buildTaskSharedProperties({ status: 'pending', isDeferred: true })).toEqual({ orbitIsTask: '1', orbitTaskStatus: 'pending', orbitTaskDeferred: '1' });
    expect(buildTaskSharedProperties({ isDeferred: false })).toEqual({ orbitIsTask: '1', orbitTaskStatus: 'not-started', orbitTaskDeferred: '0' });
  });
});

describe('canEditTaskProperties', () => {
  it('書き込み可能カレンダー・主催者・編集許可された招待者なら変更できる', () => {
    const evt = taskEvent();
    expect(canEditTaskProperties(evt, new Set(['cal-1']))).toBe(true);
    expect(canEditTaskProperties({ ...evt, raw: { ...evt.raw, organizer: { self: true } } }, new Set())).toBe(true);
    expect(canEditTaskProperties({ ...evt, raw: { ...evt.raw, guestsCanModify: true, attendees: [{ self: true }] } }, new Set())).toBe(true);
    expect(canEditTaskProperties(evt, new Set())).toBe(false);
    expect(canEditTaskProperties({ ...evt, raw: { ...evt.raw, guestsCanModify: false, attendees: [{ self: true }] } }, new Set())).toBe(false);
  });
});

describe('unfinishedTaskCountForDay', () => {
  it('その日に重なる未完了タスクだけを数える', () => {
    const day = dayjs('2026-10-20');
    const events = [
      taskEvent({ fields: { id: 't1' } }),
      taskEvent({ shared: { orbitTaskStatus: 'completed' }, fields: { id: 't2' } }),
      taskEvent({ fields: { id: 't3', startDateTime: dayjs('2026-10-25'), endDateTime: dayjs('2026-10-26'), raw: { start: { date: '2026-10-25' }, end: { date: '2026-10-26' }, extendedProperties: { shared: { orbitIsTask: '1' } } } } }),
      { fields: undefined, id: 'e1', calendarId: 'cal-1', summary: '予定', isAllDay: true, startDateTime: dayjs('2026-10-20'), endDateTime: dayjs('2026-10-21'), raw: {} },
    ];
    expect(unfinishedTaskCountForDay(events, day)).toBe(1);
    expect(unfinishedTaskCountForDay(events, dayjs('2026-10-25'))).toBe(1);
    expect(unfinishedTaskCountForDay(events, dayjs('2026-10-24'))).toBe(0);
  });
});

describe('buildTaskDeferralPatch', () => {
  const today = dayjs('2026-10-23');

  it('昨日までの終日タスクを今日へ持ち越す', () => {
    const patch = buildTaskDeferralPatch(taskEvent({ shared: { orbitTaskDeferred: '1' } }), today);
    expect(patch).toEqual({ start: { date: '2026-10-23' }, end: { date: '2026-10-24' } });
  });

  it('数日遅れの時間指定タスクを期間を保って今日へ持ち越す', () => {
    const evt = taskEvent({
      shared: { orbitTaskDeferred: '1' },
      fields: {
        isAllDay: false,
        startDateTime: dayjs('2026-10-19T10:00:00'),
        endDateTime: dayjs('2026-10-19T11:30:00'),
        raw: {
          start: { dateTime: '2026-10-19T10:00:00+09:00', timeZone: 'Asia/Tokyo' },
          end: { dateTime: '2026-10-19T11:30:00+09:00', timeZone: 'Asia/Tokyo' },
          extendedProperties: { shared: { orbitIsTask: '1', orbitTaskDeferred: '1' } },
        },
      },
    });
    const patch = buildTaskDeferralPatch(evt, today);
    expect(dayjs(patch.start.dateTime).format('YYYY-MM-DD HH:mm')).toBe('2026-10-23 10:00');
    expect(dayjs(patch.end.dateTime).format('YYYY-MM-DD HH:mm')).toBe('2026-10-23 11:30');
    expect(patch.start.timeZone).toBe('Asia/Tokyo');
  });

  it('持ち越し対象外（完了・設定なし・当日以降・非タスク）は null', () => {
    expect(buildTaskDeferralPatch(taskEvent({ shared: { orbitTaskDeferred: '1', orbitTaskStatus: 'completed' } }), today)).toBeNull();
    expect(buildTaskDeferralPatch(taskEvent({ shared: { orbitTaskDeferred: '0' } }), today)).toBeNull();
    expect(buildTaskDeferralPatch(taskEvent({ shared: { orbitTaskDeferred: '1' }, fields: { startDateTime: dayjs('2026-10-25'), endDateTime: dayjs('2026-10-26') } }), today)).toBeNull();
    expect(buildTaskDeferralPatch({ raw: {}, startDateTime: dayjs('2026-10-20'), endDateTime: dayjs('2026-10-21') }, today)).toBeNull();
  });
});

describe('normalizeTaskNotificationTimes', () => {
  it('HH:mm だけを正規化して昇順で返す', () => {
    expect(normalizeTaskNotificationTimes(['18:00', '8:0', 'x', '25:00', '09:30', '18:00'])).toEqual(['09:30', '18:00']);
    expect(normalizeTaskNotificationTimes('09:00')).toEqual([]);
    expect(normalizeTaskNotificationTimes([])).toEqual([]);
  });
});

describe('buildAllDayTaskDigestEntries', () => {
  it('日付×時刻ごとに終日タスクをまとめる', () => {
    const events = [
      taskEvent({ fields: { id: 't1', summary: '牛乳を買う' } }),
      taskEvent({ shared: { orbitTaskStatus: 'completed' }, fields: { id: 't2', summary: '完了済み' } }),
      taskEvent({
        shared: {},
        fields: {
          id: 't3',
          summary: '複数日タスク',
          startDateTime: dayjs('2026-10-20'),
          endDateTime: dayjs('2026-10-22'),
          raw: { start: { date: '2026-10-20' }, end: { date: '2026-10-22' }, extendedProperties: { shared: { orbitIsTask: '1', orbitTaskStatus: 'in-progress' } } },
        },
      }),
      taskEvent({ fields: { id: 't4', summary: '時間指定タスク', isAllDay: false, startDateTime: dayjs('2026-10-20T10:00:00'), endDateTime: dayjs('2026-10-20T11:00:00'), raw: { start: { dateTime: '2026-10-20T10:00:00' }, extendedProperties: { shared: { orbitIsTask: '1' } } } } }),
    ];
    const entries = buildAllDayTaskDigestEntries(events, dayjs('2026-10-19T00:00'), dayjs('2026-10-23T23:59'), ['08:00', '18:30'], (evt, ws, we) => [evt.startDateTime].filter((s) => !s.isBefore(ws) && !s.isAfter(we)));
    const keys = entries.map((entry) => entry.key).sort();
    expect(keys).toEqual(['task-digest|2026-10-20|08:00', 'task-digest|2026-10-20|18:30', 'task-digest|2026-10-21|08:00', 'task-digest|2026-10-21|18:30']);
    const first = entries.find((entry) => entry.key === 'task-digest|2026-10-20|08:00');
    expect(first.tasks ?? first.title).toBeTruthy();
    expect(first.body).toContain('牛乳を買う');
    expect(first.body).toContain('複数日タスク');
    expect(first.body).not.toContain('完了済み');
    expect(first.body).not.toContain('時間指定タスク');
    expect(dayjs(first.fireAt).format('YYYY-MM-DD HH:mm')).toBe('2026-10-20 08:00');
    expect(dayjs(first.start).format('YYYY-MM-DD HH:mm')).toBe('2026-10-20 23:59');
  });
});
