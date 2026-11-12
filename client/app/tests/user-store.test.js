import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

const storage = vi.hoisted(() => ({ data: {} }));

vi.mock('@/composables/useCache.js', () => ({
  CACHE_KEYS: { USER_SETTINGS: 'orbit-user-settings', RECENT_EVENT_TITLES: 'recent-event-titles' },
  readCache: vi.fn(async (key, fallback) => storage.data[key] ?? fallback),
  writeCache: vi.fn(async (key, value) => {
    storage.data[key] = JSON.parse(JSON.stringify(value));
  }),
}));

const { useUserStore } = await import('@/stores/user.js');

describe('useUserStore（設定の永続化）', () => {
  beforeEach(() => {
    for (const key of Object.keys(storage.data)) delete storage.data[key];
    setActivePinia(createPinia());
  });

  it('setMainCalendarView で MONTH/WEEK を永続化する', async () => {
    const store = useUserStore();
    store.setMainCalendarView('WEEK');
    expect(store.mainCalendarView).toBe('WEEK');
    await vi.waitFor(() => expect(storage.data['orbit-user-settings']?.mainCalendarView).toBe('WEEK'));
  });

  it('不正なモードは受け付けない', () => {
    const store = useUserStore();
    store.setMainCalendarView('DAY');
    expect(store.mainCalendarView).toBe('MONTH');
  });

  it('setUsePhotoSharing を永続化する', async () => {
    const store = useUserStore();
    store.setUsePhotoSharing(true);
    expect(store.usePhotoSharing).toBe(true);
    await vi.waitFor(() => expect(storage.data['orbit-user-settings']?.usePhotoSharing).toBe(true));
  });

  it('保存済み設定が loadSettings で復元される', async () => {
    storage.data['orbit-user-settings'] = { mainCalendarView: 'WEEK', usePhotoSharing: true };
    const store = useUserStore();
    await store.settingsReady;
    expect(store.mainCalendarView).toBe('WEEK');
    expect(store.usePhotoSharing).toBe(true);
  });
});
