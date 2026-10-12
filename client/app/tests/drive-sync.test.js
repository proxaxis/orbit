import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { CACHE_KEYS } from '@/composables/useCache.js';

const mocks = vi.hoisted(() => ({
  storage: new Map(),
  readSyncFile: vi.fn(async () => null),
  writeSyncFile: vi.fn(async () => 'file-id'),
  auth: {
    ensureDriveToken: vi.fn(async () => 'drive-token'),
    ensurePhotoToken: vi.fn(async () => 'photo-token'),
    ensurePeopleToken: vi.fn(async () => 'people-token'),
    clearPhotoToken: vi.fn(),
    clearPeopleToken: vi.fn(),
    clearDriveToken: vi.fn(),
  },
}));

vi.mock('@/composables/useCache.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    readCache: vi.fn(async (key, fallback) => (mocks.storage.has(key) ? mocks.storage.get(key) : fallback)),
    writeCache: vi.fn(async (key, value) => {
      mocks.storage.set(key, JSON.parse(JSON.stringify(value)));
    }),
    deleteCache: vi.fn(async (key) => {
      mocks.storage.delete(key);
    }),
  };
});

vi.mock('@/services/google-drive-api.js', () => ({
  SYNC_FILE_NAME: 'orbit-sync.json',
  readSyncFile: mocks.readSyncFile,
  writeSyncFile: mocks.writeSyncFile,
}));

vi.mock('@/composables/useAuth.js', () => ({
  useAuth: () => mocks.auth,
  initApiClients: vi.fn(),
}));

/** モジュール状態をリセットして依存モジュールを再読み込みする */
async function freshSetup() {
  vi.resetModules();
  setActivePinia(createPinia());
  const { useDriveSync } = await import('@/composables/useDriveSync.js');
  const { useUserStore } = await import('@/stores/user.js');
  const { useAuthStore } = await import('@/stores/auth.js');
  const { useCalendarStore } = await import('@/stores/calendar.js');
  return { driveSync: useDriveSync(), userStore: useUserStore(), authStore: useAuthStore(), calendarStore: useCalendarStore() };
}

/** @param {Record<string, any>} settings リモートに保存されている設定 */
function remoteWithSettings(settings) {
  return {
    fileId: 'file-id',
    data: {
      version: 1,
      updatedAt: '2025-12-01T00:00:00.000Z',
      settings,
      sessionCalendars: [],
    },
  };
}

beforeEach(() => {
  mocks.storage.clear();
  vi.clearAllMocks();
  mocks.readSyncFile.mockImplementation(async () => null);
  mocks.writeSyncFile.mockImplementation(async () => 'file-id');
});

describe('pullRemote（リモート設定の適用）', () => {
  it('リモートが無ければローカル状態を初期書き込みする', async () => {
    const { driveSync, userStore, authStore } = await freshSetup();
    authStore.setDriveAccessToken('drive-token');
    userStore.setUseDriveSync(true);

    await driveSync.pullRemote();
    expect(mocks.writeSyncFile).toHaveBeenCalledTimes(1);
    const data = JSON.parse(mocks.writeSyncFile.mock.calls[0][1]);
    expect(data.settings.useDriveSync).toBe(true);
  });

  it('有効化された機能フラグを適用し、対応トークンを取得する', async () => {
    mocks.readSyncFile.mockImplementation(async () =>
      remoteWithSettings({
        usePhotoSharing: true,
        usePeopleApi: true,
        useDriveSync: true,
      }),
    );
    const { driveSync, userStore, authStore } = await freshSetup();
    authStore.setDriveAccessToken('drive-token');
    userStore.setUseDriveSync(true);

    await driveSync.pullRemote();
    expect(userStore.usePhotoSharing).toBe(true);
    expect(userStore.usePeopleApi).toBe(true);
    expect(mocks.auth.ensurePhotoToken).toHaveBeenCalledTimes(1);
    expect(mocks.auth.ensurePeopleToken).toHaveBeenCalledTimes(1);
  });

  it('無効化された機能フラグを適用し、保持トークンを破棄する', async () => {
    mocks.readSyncFile.mockImplementation(async () =>
      remoteWithSettings({
        usePhotoSharing: false,
        usePeopleApi: false,
        useDriveSync: true,
      }),
    );
    const { driveSync, userStore, authStore } = await freshSetup();
    authStore.setDriveAccessToken('drive-token');
    userStore.setUseDriveSync(true);
    userStore.setUsePhotoSharing(true);
    userStore.setUsePeopleApi(true);

    await driveSync.pullRemote();
    expect(userStore.usePhotoSharing).toBe(false);
    expect(userStore.usePeopleApi).toBe(false);
    expect(mocks.auth.clearPhotoToken).toHaveBeenCalledTimes(1);
    expect(mocks.auth.clearPeopleToken).toHaveBeenCalledTimes(1);
  });

  it('カレンダーの並び順をリモートから適用する', async () => {
    mocks.readSyncFile.mockImplementation(async () =>
      remoteWithSettings({
        useDriveSync: true,
        calendarOrder: ['cal-b', 'cal-a'],
      }),
    );
    const { driveSync, userStore, authStore } = await freshSetup();
    authStore.setDriveAccessToken('drive-token');
    userStore.setUseDriveSync(true);
    userStore.setCalendarOrder(['cal-a', 'cal-b']);

    await driveSync.pullRemote();
    expect(userStore.calendarOrder).toEqual(['cal-b', 'cal-a']);
  });

  it('他デバイスで Drive 同期が無効化された場合はローカルでも停止する', async () => {
    mocks.readSyncFile.mockImplementation(async () => remoteWithSettings({ useDriveSync: false }));
    const { driveSync, userStore, authStore } = await freshSetup();
    authStore.setAccessToken('main-token');
    authStore.setDriveAccessToken('drive-token');
    userStore.setUseDriveSync(true);

    await driveSync.initDriveSync();
    expect(userStore.useDriveSync).toBe(false);
  });
});

describe('pushRemote / disableDriveSync', () => {
  it('同期無効時は push しないが、force では書き込む', async () => {
    const { driveSync, userStore, authStore } = await freshSetup();
    authStore.setDriveAccessToken('drive-token');

    await driveSync.pushRemote();
    expect(mocks.writeSyncFile).not.toHaveBeenCalled();

    await driveSync.pushRemote({ force: true });
    expect(mocks.writeSyncFile).toHaveBeenCalledTimes(1);
  });

  it('設定の変更（カレンダー並び順を含む）をリモートへ書き込む', async () => {
    const { driveSync, userStore, authStore } = await freshSetup();
    authStore.setDriveAccessToken('drive-token');
    userStore.setUseDriveSync(true);
    userStore.setCalendarOrder(['cal-b', 'cal-a']);
    userStore.setUsePhotoSharing(true);

    await driveSync.pushRemote();
    const data = JSON.parse(mocks.writeSyncFile.mock.calls[0][1]);
    expect(data.settings.calendarOrder).toEqual(['cal-b', 'cal-a']);
    expect(data.settings.usePhotoSharing).toBe(true);
  });

  it('disableDriveSync は無効化状態をリモートへ書き込んでから停止する', async () => {
    const { driveSync, userStore, authStore } = await freshSetup();
    authStore.setDriveAccessToken('drive-token');
    userStore.setUseDriveSync(true);

    await driveSync.disableDriveSync();
    expect(userStore.useDriveSync).toBe(false);
    expect(mocks.writeSyncFile).toHaveBeenCalledTimes(1);
    const data = JSON.parse(mocks.writeSyncFile.mock.calls[0][1]);
    expect(data.settings.useDriveSync).toBe(false);
  });
});
