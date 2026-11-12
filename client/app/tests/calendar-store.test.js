import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

const mocks = vi.hoisted(() => ({
  listCalendarList: vi.fn(async () => ({ items: [] })),
  patchCalendarListEntry: vi.fn(async () => null),
  patchCalendar: vi.fn(async () => null),
  getCalendarListEntry: vi.fn(async () => null),
  getCalendar: vi.fn(async () => null),
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
vi.mock('@/composables/useCalendarEvents.js', () => ({ resetSharedEventCache: vi.fn() }));
vi.mock('@/composables/useNotifications.js', () => ({ resetNotificationHistory: vi.fn() }));
vi.mock('@/composables/usePeople.js', () => ({ resetSearchCache: vi.fn() }));

const { useCalendarStore } = await import('@/stores/calendar.js');
const { useCalendars } = await import('@/composables/useCalendars.js');
const { useCalendarDetail } = await import('@/composables/useCalendarDetail.js');
const { writeCache } = await import('@/composables/useCache.js');

describe('getCalendarName', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    mocks.listCalendarList.mockImplementation(async () => ({ items: [] }));
    mocks.patchCalendarListEntry.mockImplementation(async () => null);
    mocks.patchCalendar.mockImplementation(async () => null);
  });

  it('summaryOverride があれば別名を優先して返す', () => {
    const calendarStore = useCalendarStore();
    calendarStore.setCalendars([
      { id: 'shared-cal', summary: '元の名前', summaryOverride: '別名カレンダー', accessRole: 'reader' },
      { id: 'own-cal', summary: '自分のカレンダー', accessRole: 'owner' },
    ]);
    expect(calendarStore.getCalendarName('shared-cal')).toBe('別名カレンダー');
    expect(calendarStore.getCalendarName('own-cal')).toBe('自分のカレンダー');
    expect(calendarStore.getCalendarName('unknown')).toBe('');
  });
});

describe('loadCalendars（別名の永続化）', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    mocks.patchCalendarListEntry.mockImplementation(async () => null);
    mocks.patchCalendar.mockImplementation(async () => null);
  });

  it('キャッシュ削除後の再読み込みで別名が API の summaryOverride から復元される', async () => {
    const calendarStore = useCalendarStore();
    const calendars = useCalendars();
    // キャッシュは空（readCache がフォールバックを返す）として API 応答のみから復元する
    mocks.listCalendarList.mockImplementation(async () => ({
      items: [
        { id: 'user@example.com', summary: '自分', primary: true, accessRole: 'owner' },
        { id: 'shared-cal', summary: '元の名前', summaryOverride: '別名カレンダー', accessRole: 'reader' },
      ],
    }));

    await calendars.loadCalendars();

    const stored = calendarStore.list.find((cal) => cal.id === 'shared-cal');
    expect(stored.summary).toBe('元の名前');
    expect(stored.summaryOverride).toBe('別名カレンダー');
    expect(calendarStore.getCalendarName('shared-cal')).toBe('別名カレンダー');
    // 別名を保持したままオフラインキャッシュへ書き戻される
    expect(writeCache).toHaveBeenCalledWith('calendars', expect.arrayContaining([expect.objectContaining({ id: 'shared-cal', summaryOverride: '別名カレンダー' })]));
  });
});

describe('saveCalendarDetail（別名の保存）', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    mocks.listCalendarList.mockImplementation(async () => ({ items: [] }));
  });

  it('共有カレンダーの別名は calendarList の summaryOverride として保存される', async () => {
    const calendarStore = useCalendarStore();
    const detail = useCalendarDetail();
    const sharedEntry = { id: 'shared-cal', summary: '元の名前', accessRole: 'reader', colorId: '1' };
    calendarStore.setCalendars([sharedEntry]);
    mocks.patchCalendarListEntry.mockImplementation(async (_token, _id, body) => ({ ...sharedEntry, ...body }));

    await detail.saveCalendarDetail('shared-cal', { summary: '別名カレンダー', description: '', location: '', timeZone: 'Asia/Tokyo', colorId: '3' }, { isOwner: false, canEdit: false }, sharedEntry);

    // 別名は summaryOverride として Google へ同期され、本体は更新しない
    expect(mocks.patchCalendarListEntry).toHaveBeenCalledWith('token', 'shared-cal', { colorId: '3', summaryOverride: '別名カレンダー' });
    expect(mocks.patchCalendar).not.toHaveBeenCalled();
    // ストア上も本体名と別名を分けて保持し、表示名は別名になる
    const stored = calendarStore.list.find((cal) => cal.id === 'shared-cal');
    expect(stored.summary).toBe('元の名前');
    expect(stored.summaryOverride).toBe('別名カレンダー');
    expect(calendarStore.getCalendarName('shared-cal')).toBe('別名カレンダー');
  });

  it('オーナーのカレンダー名変更は本体の summary を更新する', async () => {
    const calendarStore = useCalendarStore();
    const detail = useCalendarDetail();
    const ownerEntry = { id: 'own-cal', summary: '旧名', accessRole: 'owner', colorId: '1' };
    calendarStore.setCalendars([ownerEntry]);
    mocks.patchCalendarListEntry.mockImplementation(async (_token, _id, body) => ({ ...ownerEntry, ...body }));
    mocks.patchCalendar.mockImplementation(async (_token, _id, body) => ({ id: 'own-cal', ...body }));

    await detail.saveCalendarDetail('own-cal', { summary: '新しい名前', description: 'd', location: 'l', timeZone: 'Asia/Tokyo', colorId: '2' }, { isOwner: true, canEdit: true }, ownerEntry);

    // オーナーは本体リソースを更新し、summaryOverride は送らない
    expect(mocks.patchCalendarListEntry).toHaveBeenCalledWith('token', 'own-cal', { colorId: '2' });
    expect(mocks.patchCalendar).toHaveBeenCalledWith('token', 'own-cal', { summary: '新しい名前', description: 'd', location: 'l', timeZone: 'Asia/Tokyo' });
    expect(calendarStore.getCalendarName('own-cal')).toBe('新しい名前');
  });
});
