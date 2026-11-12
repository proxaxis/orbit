import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

const mocks = vi.hoisted(() => ({
  listEventsBatch: vi.fn(async () => []),
}));

vi.mock('@/services/google-calendar-api.js', () => mocks);
vi.mock('@/composables/useCache.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    readCache: vi.fn(async (_key, fallback) => fallback),
    writeCache: vi.fn(async () => {}),
    deleteCache: vi.fn(async () => {}),
  };
});
vi.mock('@/stores/auth.js', () => ({
  useAuthStore: () => ({ token: 'token', isAuthenticated: true }),
}));
vi.mock('@/composables/useNotifications.js', () => ({ rescheduleNotifications: vi.fn(), resetNotificationHistory: vi.fn() }));
vi.mock('@/composables/useCalendarEvents.js', () => ({ resetSharedEventCache: vi.fn() }));
vi.mock('@/composables/usePeople.js', () => ({ resetSearchCache: vi.fn() }));
vi.mock('@/services/event-offline.js', () => ({
  getStoredEvents: vi.fn(async () => []),
  storedEventsForMonth: vi.fn(async () => []),
  readEventOperations: vi.fn(async () => []),
  writeEventOperations: vi.fn(async () => {}),
  removeStoredEvent: vi.fn(async () => {}),
  upsertStoredEvent: vi.fn(async () => {}),
  processEventOperations: vi.fn(async () => ({ remaining: [], synced: false })),
}));
vi.mock('@/services/event-sync-worker.js', () => ({ runEventOperation: vi.fn() }));

const { BIRTHDAY_CALENDAR_ID, BIRTHDAY_CALENDAR_ENTRY, isBirthdayCalendarId, eventsQueryForCalendar } = await import('@/services/birthday-calendar.js');
const { useCalendarStore } = await import('@/stores/calendar.js');
const { useUserStore } = await import('@/stores/user.js');
const { useEvents } = await import('@/composables/useEvents.js');

describe('isBirthdayCalendarId / eventsQueryForCalendar', () => {
  it('誕生日カレンダー ID のみ誕生日カレンダーと判定する', () => {
    expect(isBirthdayCalendarId(BIRTHDAY_CALENDAR_ID)).toBe(true);
    expect(isBirthdayCalendarId('other@example.com')).toBe(false);
    expect(isBirthdayCalendarId(null)).toBe(false);
  });

  it('誕生日カレンダーには eventTypes=birthday を付与し、他カレンダーには付けない', () => {
    expect(eventsQueryForCalendar(BIRTHDAY_CALENDAR_ID, { timeMin: 'x' })).toEqual({ timeMin: 'x', eventTypes: ['birthday'] });
    expect(eventsQueryForCalendar('other@example.com', { timeMin: 'x' })).toEqual({ timeMin: 'x' });
  });
});

describe('calendar store の誕生日カレンダー', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('calendarList に無くても特殊カレンダーとして一覧の末尾に現れる', () => {
    const calendarStore = useCalendarStore();
    calendarStore.setCalendars([{ id: 'own@example.com', summary: '自分', primary: true, accessRole: 'owner' }]);

    const birthday = calendarStore.list.at(-1);
    expect(birthday.id).toBe(BIRTHDAY_CALENDAR_ID);
    expect(birthday.birthday).toBe(true);
    expect(calendarStore.getCalendarName(BIRTHDAY_CALENDAR_ID)).toBe('誕生日');
    // カレンダー未読込（初期状態）では注入しない
    setActivePinia(createPinia());
    expect(useCalendarStore().list).toHaveLength(0);
  });

  it('Google の calendarList に実エントリがある場合は仮想エントリで重複させない', () => {
    const calendarStore = useCalendarStore();
    const realEntry = { id: BIRTHDAY_CALENDAR_ID, summary: 'Birthdays', accessRole: 'reader', backgroundColor: '#123456' };
    calendarStore.setCalendars([{ id: 'own@example.com', summary: '自分', primary: true, accessRole: 'owner' }, realEntry]);

    const birthdays = calendarStore.list.filter((cal) => cal.id === BIRTHDAY_CALENDAR_ID);
    expect(birthdays).toHaveLength(1);
    expect(birthdays[0].summary).toBe('Birthdays');
  });

  it('書き込み対象カレンダーには含まれないが、表示カレンダーには含まれる', () => {
    const calendarStore = useCalendarStore();
    calendarStore.setCalendars([{ id: 'own@example.com', summary: '自分', primary: true, accessRole: 'owner' }]);

    expect(calendarStore.listWritableCalendars.some((cal) => isBirthdayCalendarId(cal.id))).toBe(false);
    expect(calendarStore.listVisibleCalendars.some((cal) => isBirthdayCalendarId(cal.id))).toBe(true);
  });

  it('表示・非表示は既存の hiddenCalendarIds 経由で切り替えられる', () => {
    const calendarStore = useCalendarStore();
    const userStore = useUserStore();
    calendarStore.setCalendars([]);

    userStore.setCalendarVisibility(BIRTHDAY_CALENDAR_ID, false);
    expect(calendarStore.listVisibleCalendars.some((cal) => isBirthdayCalendarId(cal.id))).toBe(false);
    userStore.setCalendarVisibility(BIRTHDAY_CALENDAR_ID, true);
    expect(calendarStore.listVisibleCalendars.some((cal) => isBirthdayCalendarId(cal.id))).toBe(true);
  });

  it('仮想エントリは他カレンダーの更新・削除でオフラインキャッシュへ書き戻されない', async () => {
    const { writeCache } = await import('@/composables/useCache.js');
    const calendarStore = useCalendarStore();
    calendarStore.setCalendars([{ id: 'own@example.com', summary: '自分', primary: true, accessRole: 'owner' }]);

    calendarStore.updateCalendar({ id: 'own@example.com', summary: '改名', primary: true, accessRole: 'owner' });
    const saved = writeCache.mock.calls.map((call) => call[1]).flat();
    expect(saved.some((entry) => /** @type {any} */ (entry).birthday)).toBe(false);
  });
});

describe('誕生日イベントの取得クエリ', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('イベント検索で誕生日カレンダーには eventTypes=birthday を送る', async () => {
    const calendarStore = useCalendarStore();
    calendarStore.setCalendars([{ id: 'own@example.com', summary: '自分', primary: true, accessRole: 'owner' }]);
    const events = useEvents();

    await events.searchEvents('誕生日');

    expect(mocks.listEventsBatch).toHaveBeenCalledTimes(1);
    const targets = mocks.listEventsBatch.mock.calls[0][1];
    const birthdayTarget = targets.find((target) => target.calendarId === BIRTHDAY_CALENDAR_ID);
    const normalTarget = targets.find((target) => target.calendarId === 'own@example.com');
    expect(birthdayTarget.query.eventTypes).toEqual(['birthday']);
    expect(normalTarget.query.eventTypes).toBeUndefined();
  });
});
