import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import dayjs from '@/services/dayjs.js';

const readOfflineMock = vi.fn(async () => []);
const writeOfflineMock = vi.fn(async () => {});

vi.mock('@/services/offline-storage.js', () => ({
  readOffline: (...args) => readOfflineMock(...args),
  writeOffline: (...args) => writeOfflineMock(...args),
}));

// モックを仕込んでから対象モジュールを読み込む
const notifications = await import('@/services/notifications.js');
const { reminderMinutesOf, eventStartOf, occurrenceStarts, rescheduleNotifications, initEventNotifications } = notifications;

class MockNotification {
  static permission = 'granted';
  constructor(title, options) {
    MockNotification.instances.push({ title, options });
  }
  static instances = [];
}
vi.stubGlobal('Notification', MockNotification);
window.Notification = MockNotification;

const showNotification = vi.fn(async () => {});
Object.defineProperty(navigator, 'serviceWorker', {
  value: { getRegistration: async () => ({ showNotification }) },
  configurable: true,
});

describe('reminderMinutesOf', () => {
  it('useDefault=false のとき overrides の分数を返す', () => {
    const evt = { raw: { reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 10 }, { method: 'popup', minutes: 60 }] } } };
    expect(reminderMinutesOf(evt, {})).toEqual([10, 60]);
  });

  it('useDefault のときカレンダー既定の popup リマインダーを使う', () => {
    const evt = { raw: { reminders: { useDefault: true } } };
    const calendar = { defaultReminders: [{ method: 'popup', minutes: 30 }, { method: 'email', minutes: 60 }] };
    expect(reminderMinutesOf(evt, calendar)).toEqual([30]);
  });

  it('リマインダーなしは空配列', () => {
    expect(reminderMinutesOf({}, {})).toEqual([]);
    expect(reminderMinutesOf({ raw: { reminders: { useDefault: false } } }, {})).toEqual([]);
  });

  it('5件まで・上限 40320 分に丸める', () => {
    const overrides = Array.from({ length: 7 }, (_, i) => ({ method: 'popup', minutes: (i + 1) * 10 }));
    overrides[6].minutes = 99999;
    const evt = { raw: { reminders: { useDefault: false, overrides } } };
    const minutes = reminderMinutesOf(evt, {});
    expect(minutes).toHaveLength(5);
    expect(reminderMinutesOf({ raw: { reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 99999 }] } } }, {})).toEqual([40320]);
  });
});

describe('eventStartOf / occurrenceStarts', () => {
  it('raw.start.dateTime から開始日時を得る', () => {
    const evt = { raw: { start: { dateTime: '2026-10-06T10:00:00+09:00' } } };
    expect(eventStartOf(evt).format('YYYY-MM-DD HH:mm')).toBe('2026-10-06 10:00');
  });

  it('開始日時が取れない場合は null', () => {
    expect(eventStartOf({})).toBeNull();
    expect(eventStartOf(null)).toBeNull();
  });

  it('繰り返しでないイベントは開始日時を1件返す', () => {
    const evt = { raw: { start: { dateTime: '2026-10-06T10:00:00' } } };
    const starts = occurrenceStarts(evt, dayjs('2026-10-01'), dayjs('2026-10-31'));
    expect(starts).toHaveLength(1);
    expect(starts[0].format('YYYY-MM-DD HH:mm')).toBe('2026-10-06 10:00');
  });

  it('RRULE の繰り返しをウィンドウ内へ展開する', () => {
    const evt = {
      raw: {
        start: { dateTime: '2026-10-05T10:00:00' },
        recurrence: ['RRULE:FREQ=WEEKLY;COUNT=3'],
      },
    };
    const starts = occurrenceStarts(evt, dayjs('2026-10-01T00:00'), dayjs('2026-10-31T00:00'));
    expect(starts.map((s) => s.format('YYYY-MM-DD HH:mm'))).toEqual([
      '2026-10-05 10:00',
      '2026-10-12 10:00',
      '2026-10-19 10:00',
    ]);
  });

  it('不正な recurrence はフォールバックで開始日時を返す', () => {
    const evt = {
      raw: {
        start: { dateTime: '2026-10-05T10:00:00' },
        recurrence: ['RRULE:FREQ=BOGUS!!!'],
      },
    };
    const starts = occurrenceStarts(evt, dayjs('2026-10-01'), dayjs('2026-10-31'));
    expect(starts).toHaveLength(1);
    expect(starts[0].format('YYYY-MM-DD HH:mm')).toBe('2026-10-05 10:00');
  });
});

describe('rescheduleNotifications', () => {
  beforeEach(() => {
    // フェイクタイマー適用後に init することで再スキャンの setInterval もフェイク化される
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 6, 9, 0, 0)); // 2026-10-06 09:00
    MockNotification.instances = [];
    showNotification.mockClear();
    readOfflineMock.mockClear();
    writeOfflineMock.mockClear();
    initEventNotifications();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function storedEvent(overrides = {}) {
    return {
      id: 'evt-1',
      calendarId: 'cal-1',
      summary: '朝会',
      raw: {
        start: { dateTime: '2026-10-06T10:00:00' },
        end: { dateTime: '2026-10-06T10:30:00' },
        reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 90 }] },
      },
      ...overrides,
    };
  }

  function mockStorage(events, calendars = []) {
    readOfflineMock.mockImplementation(async (key, fallback) => {
      if (key === 'events') return events;
      if (key === 'calendars') return calendars;
      if (key === 'notified-events') return [];
      return fallback;
    });
  }

  it('通知時刻を過ぎ・開始前の予定で通知が発火する', async () => {
    // 10:00 開始・90分前通知 → 通知時刻 8:30 は現在 9:00 を過ぎているが開始はまだ
    mockStorage([storedEvent()]);
    await rescheduleNotifications();
    expect(showNotification).toHaveBeenCalledTimes(1);
    expect(showNotification.mock.calls[0][0]).toContain('朝会');
  });

  it('通知時刻が未来の予定は発火せずタイマーがセットされる', async () => {
    const setTimeoutSpy = vi.spyOn(window, 'setTimeout');
    mockStorage([storedEvent({ raw: { start: { dateTime: '2026-10-06T10:00:00' }, end: { dateTime: '2026-10-06T11:00:00' }, reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 10 }] } } })]);
    await rescheduleNotifications();
    expect(showNotification).not.toHaveBeenCalled();
    expect(setTimeoutSpy.mock.calls.some(([, delay]) => delay > 0)).toBe(true);
    setTimeoutSpy.mockRestore();
  });

  it('同じキーの通知は二度送らない', async () => {
    // 他テストと通知キーが重複しないよう別 ID・別時刻を使う
    mockStorage([storedEvent({ id: 'evt-dedupe', raw: { start: { dateTime: '2026-10-06T10:05:00' }, reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 90 }] } } })]);
    await rescheduleNotifications();
    await rescheduleNotifications();
    expect(showNotification).toHaveBeenCalledTimes(1);
  });

  it('リマインダー設定のない予定では通知しない', async () => {
    mockStorage([{ id: 'e2', calendarId: 'cal-1', summary: 'x', raw: { start: { dateTime: '2026-10-06T10:00:00' }, reminders: { useDefault: false } } }]);
    await rescheduleNotifications();
    expect(showNotification).not.toHaveBeenCalled();
  });

  it('開始済みの予定では通知しない', async () => {
    // 8:00 開始・90分前(6:30) → 現在 9:00 では開始済み
    mockStorage([{ id: 'e3', calendarId: 'cal-1', summary: '早朝', raw: { start: { dateTime: '2026-10-06T08:00:00' }, reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 90 }] } } }]);
    await rescheduleNotifications();
    expect(showNotification).not.toHaveBeenCalled();
  });

  it('繰り返し予定の各回が通知対象になる', async () => {
    mockStorage([
      {
        id: 'e4',
        calendarId: 'cal-1',
        summary: '週次',
        raw: {
          start: { dateTime: '2026-10-06T10:00:00' },
          recurrence: ['RRULE:FREQ=WEEKLY;COUNT=4'],
          reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 90 }] },
        },
      },
    ]);
    await rescheduleNotifications();
    // 今日 10:00 の回のみ通知時刻(8:30)を過ぎて開始前 → 1回発火。残り3回は未来なのでタイマー待ち。
    expect(showNotification).toHaveBeenCalledTimes(1);
  });
});
