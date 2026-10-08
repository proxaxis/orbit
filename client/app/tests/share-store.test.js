import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import dayjs from '@/services/dayjs.js';

const mocks = vi.hoisted(() => ({
  listEvents: vi.fn(async () => ({ items: [] })),
  insertEvent: vi.fn(async () => ({ id: 'copy-evt-new' })),
  patchEvent: vi.fn(async () => ({})),
  deleteEvent: vi.fn(async () => null),
  insertCalendar: vi.fn(async () => ({ id: 'copy-cal-1' })),
  deleteCalendar: vi.fn(async () => null),
  insertAcl: vi.fn(async () => ({ id: 'acl-1' })),
}));

vi.mock('@/services/google-calendar-api.js', () => mocks);
vi.mock('@/composables/useCache.js', () => ({
  CACHE_KEYS: { SHARE_SPECS: 'share-specs' },
  SYNC_TAGS: { SHARE_SYNC: 'orbit-share-sync' },
  readCache: vi.fn(async (key, fallback) => fallback),
  writeCache: vi.fn(async () => {}),
  registerBackgroundSync: vi.fn(async () => false),
}));
vi.mock('@/stores/auth.js', () => ({
  BFF_BASE_URL: '',
  useAuthStore: () => ({ token: 'cal-token', isAuthenticated: true }),
}));

const { useShareStore } = await import('@/stores/share.js');
const { useShare } = await import('@/composables/useShare.js');

const baseInput = {
  title: 'テスト共有',
  recipient: 'friend@example.com',
  calendarIds: ['cal-1'],
  rangeStart: '2026-10-01',
  rangeEnd: '2026-10-31',
  expiresAt: '2030-01-01',
  role: 'reader',
};

function sourceEvent(overrides = {}) {
  return {
    id: 'src-1',
    status: 'confirmed',
    summary: 'ランチ',
    description: '詳細メモ',
    location: '会議室A',
    updated: '2026-10-01T00:00:00Z',
    start: { dateTime: '2026-10-05T12:00:00+09:00' },
    end: { dateTime: '2026-10-05T13:00:00+09:00' },
    attendees: [{ email: 'a@example.com' }],
    ...overrides,
  };
}

describe('useShareStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    mocks.listEvents.mockImplementation(async () => ({ items: [] }));
    mocks.insertCalendar.mockResolvedValue({ id: 'copy-cal-1' });
    mocks.insertAcl.mockResolvedValue({ id: 'acl-1' });
  });

  describe('createShare', () => {
    it('コピーカレンダー作成→予定コピー→ACL共有の順で実行される', async () => {
      const store = useShareStore();
      mocks.listEvents.mockImplementation(async (token, calendarId) =>
        calendarId === 'cal-1' ? { items: [sourceEvent(), sourceEvent({ id: 'src-cancelled', status: 'cancelled' })] } : { items: [] },
      );

      const spec = await useShare().createShare(baseInput);

      expect(mocks.insertCalendar).toHaveBeenCalledWith('cal-token', expect.objectContaining({ summary: 'テスト共有' }));
      expect(spec.copyCalendarId).toBe('copy-cal-1');
      // cancelled はコピーしない
      expect(mocks.insertEvent).toHaveBeenCalledTimes(1);
      const [, copyCalId, body] = mocks.insertEvent.mock.calls[0];
      expect(copyCalId).toBe('copy-cal-1');
      expect(body.summary).toBe('ランチ');
      expect(body.extendedProperties.private.orbitShareSource).toBe('cal-1:src-1');
      // 出席者はコピーされない
      expect(body.attendees).toBeUndefined();
      // reader 権限で ACL 付与
      expect(mocks.insertAcl).toHaveBeenCalledWith('cal-token', 'copy-cal-1', { scope: { type: 'user', value: 'friend@example.com' }, role: 'reader' }, { sendNotifications: true });
      expect(spec.aclRuleId).toBe('acl-1');
      expect(store.specs).toHaveLength(1);
    });

    it('freeBusyReader の場合は内容を伏せてコピーする', async () => {
      const store = useShareStore();
      mocks.listEvents.mockResolvedValue({ items: [sourceEvent()] });
      await useShare().createShare({ ...baseInput, role: 'freeBusyReader' });

      const [, , body] = mocks.insertEvent.mock.calls[0];
      expect(body.summary).toBe('予定あり');
      expect(body.description).toBeUndefined();
      expect(body.location).toBeUndefined();
      expect(mocks.insertAcl.mock.calls[0][2].role).toBe('freeBusyReader');
    });

    it('途中で失敗したらコピーカレンダーを削除する', async () => {
      const store = useShareStore();
      mocks.insertAcl.mockRejectedValue(new Error('acl failed'));
      mocks.listEvents.mockResolvedValue({ items: [sourceEvent()] });

      await expect(useShare().createShare(baseInput)).rejects.toThrow('acl failed');
      expect(mocks.deleteCalendar).toHaveBeenCalledWith('cal-token', 'copy-cal-1');
      expect(store.specs).toHaveLength(0);
    });
  });

  describe('isExpired', () => {
    it('expiresAt 当日は有効・前日は期限切れ', () => {
      const store = useShareStore();
      const today = dayjs().format('YYYY-MM-DD');
      expect(useShare().isExpired({ expiresAt: today })).toBe(false);
      expect(useShare().isExpired({ expiresAt: dayjs().subtract(1, 'day').format('YYYY-MM-DD') })).toBe(true);
      expect(useShare().isExpired({ expiresAt: dayjs().add(1, 'day').format('YYYY-MM-DD') })).toBe(false);
    });
  });

  describe('syncShare', () => {
    function makeSpec(overrides = {}) {
      return {
        id: 'share-x',
        copyCalendarId: 'copy-cal-1',
        calendarIds: ['cal-1'],
        rangeStart: '2026-10-01',
        rangeEnd: '2026-10-31',
        expiresAt: dayjs().add(7, 'day').format('YYYY-MM-DD'),
        role: 'reader',
        ...overrides,
      };
    }

    it('新規→挿入・更新→パッチ・削除→削除を行う', async () => {
      const store = useShareStore();
      const spec = makeSpec();
      store.specs = [spec];

      mocks.listEvents.mockImplementation(async (token, calendarId) => {
        if (calendarId === 'cal-1') {
          // src-1 は更新済み、src-3 は新規
          return { items: [sourceEvent({ updated: '2026-10-02T00:00:00Z' }), sourceEvent({ id: 'src-3', summary: '追加予定' })] };
        }
        if (calendarId === 'copy-cal-1') {
          return {
            items: [
              { id: 'copy-1', extendedProperties: { private: { orbitShareSource: 'cal-1:src-1', orbitShareUpdated: '2026-10-01T00:00:00Z' } } },
              { id: 'copy-obsolete', extendedProperties: { private: { orbitShareSource: 'cal-1:src-2' } } },
            ],
          };
        }
        return { items: [] };
      });

      const ok = await useShare().syncShare(spec);
      expect(ok).toBe(true);
      expect(mocks.patchEvent).toHaveBeenCalledWith('cal-token', 'copy-cal-1', 'copy-1', expect.objectContaining({ summary: 'ランチ' }));
      expect(mocks.insertEvent).toHaveBeenCalledWith('cal-token', 'copy-cal-1', expect.objectContaining({ summary: '追加予定' }));
      expect(mocks.deleteEvent).toHaveBeenCalledWith('cal-token', 'copy-cal-1', 'copy-obsolete');
      expect(spec.lastSyncedAt).toBeTruthy();
    });

    it('変更のないコピーはパッチしない', async () => {
      const store = useShareStore();
      const spec = makeSpec();
      store.specs = [spec];

      mocks.listEvents.mockImplementation(async (token, calendarId) =>
        calendarId === 'cal-1'
          ? { items: [sourceEvent()] }
          : { items: [{ id: 'copy-1', extendedProperties: { private: { orbitShareSource: 'cal-1:src-1', orbitShareUpdated: '2026-10-01T00:00:00Z' } } }] },
      );

      await useShare().syncShare(spec);
      expect(mocks.patchEvent).not.toHaveBeenCalled();
      expect(mocks.insertEvent).not.toHaveBeenCalled();
      expect(mocks.deleteEvent).not.toHaveBeenCalled();
    });

    it('期限切れの共有はカレンダーごと削除して一覧から外す', async () => {
      const store = useShareStore();
      const spec = makeSpec({ expiresAt: dayjs().subtract(1, 'day').format('YYYY-MM-DD') });
      store.specs = [spec];

      const ok = await useShare().syncShare(spec);
      expect(ok).toBe(true);
      expect(mocks.deleteCalendar).toHaveBeenCalledWith('cal-token', 'copy-cal-1');
      expect(store.specs).toHaveLength(0);
      // 期限切れでは同期のためのイベント取得は行わない
      expect(mocks.listEvents).not.toHaveBeenCalled();
    });
  });

  describe('removeShare', () => {
    it('コピーカレンダーを削除して spec を除去する', async () => {
      const store = useShareStore();
      store.specs = [{ id: 'share-x', copyCalendarId: 'copy-cal-1' }];
      await useShare().removeShare('share-x');
      expect(mocks.deleteCalendar).toHaveBeenCalledWith('cal-token', 'copy-cal-1');
      expect(store.specs).toHaveLength(0);
    });
  });
});
