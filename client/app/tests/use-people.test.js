import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

const mocks = vi.hoisted(() => ({
  storage: new Map(),
  searchContacts: vi.fn(async () => ({ results: [] })),
  searchOtherContacts: vi.fn(async () => ({ results: [] })),
  listConnections: vi.fn(async () => ({ connections: [] })),
  ensurePeopleToken: vi.fn(async () => 'people-token'),
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

vi.mock('@/services/google-people-api.js', () => ({
  setTokenRefresher: vi.fn(),
  searchContacts: mocks.searchContacts,
  searchOtherContacts: mocks.searchOtherContacts,
  listConnections: mocks.listConnections,
}));

vi.mock('@/composables/useAuth.js', () => ({
  useAuth: () => ({ ensurePeopleToken: mocks.ensurePeopleToken }),
  initApiClients: vi.fn(),
}));

/**
 * 登録済み連絡先のテストデータを作る
 * @param {string} name 表示名
 * @param {string} email メールアドレス
 * @param {string} resourceName リソース名
 * @returns {GooglePeoplePerson}
 */
function contactPerson(name, email, resourceName = 'people/c1') {
  return {
    resourceName,
    names: [{ displayName: name }],
    emailAddresses: [{ value: email }],
    metadata: { sources: [{ type: 'CONTACT', id: 'contact-id' }] },
  };
}

/**
 * 「その他の連絡先」のテストデータを作る
 * @param {string} name 表示名
 * @param {string} email メールアドレス
 * @param {string} resourceName リソース名
 * @returns {GooglePeoplePerson}
 */
function otherContactPerson(name, email, resourceName = 'otherContacts/c9') {
  return {
    resourceName,
    names: [{ displayName: name }],
    emailAddresses: [{ value: email }],
    metadata: { sources: [{ type: 'OTHER_CONTACT', id: 'other-id' }] },
  };
}

/** 連絡先連携を有効化した状態で usePeople を返す */
async function setupEnabled() {
  vi.resetModules();
  setActivePinia(createPinia());
  const { usePeople } = await import('@/composables/usePeople.js');
  const { useUserStore } = await import('@/stores/user.js');
  const { useAuthStore } = await import('@/stores/auth.js');
  const { usePeopleStore } = await import('@/stores/people.js');
  const authStore = useAuthStore();
  const userStore = useUserStore();
  const peopleStore = usePeopleStore();
  authStore.setAccessToken('access-token');
  userStore.setUsePeopleApi(true);
  return { people: usePeople(), userStore, authStore, peopleStore };
}

beforeEach(() => {
  mocks.storage.clear();
  vi.clearAllMocks();
  mocks.searchContacts.mockImplementation(async () => ({ results: [] }));
  mocks.searchOtherContacts.mockImplementation(async () => ({ results: [] }));
  mocks.listConnections.mockImplementation(async () => ({ connections: [] }));
  mocks.ensurePeopleToken.mockImplementation(async () => 'people-token');
});

describe('usePeople の検索', () => {
  it('登録済み連絡先と「その他の連絡先」の結果がマージされる', async () => {
    const contact = contactPerson('Proxaxis', 'proxaxis.me@gmail.com');
    const other = otherContactPerson('Hosoda', 'hosoda.y.ml@gmail.com');
    mocks.searchContacts.mockResolvedValue({ results: [{ person: contact }] });
    mocks.searchOtherContacts.mockResolvedValue({ results: [{ person: other }] });

    const { people } = await setupEnabled();
    const result = await people.search('gmail');

    expect(mocks.searchContacts).toHaveBeenCalledTimes(1);
    expect(mocks.searchOtherContacts).toHaveBeenCalledTimes(1);
    expect(result.map((p) => p.resourceName)).toEqual(['people/c1', 'otherContacts/c9']);
  });

  it('同一メールアドレスが両方に存在する場合は登録済み連絡先が残る', async () => {
    const contact = contactPerson('Proxaxis', 'same@gmail.com', 'people/c1');
    const other = otherContactPerson('Proxaxis (other)', 'same@gmail.com', 'otherContacts/c1');
    mocks.searchContacts.mockResolvedValue({ results: [{ person: contact }] });
    mocks.searchOtherContacts.mockResolvedValue({ results: [{ person: other }] });

    const { people } = await setupEnabled();
    const result = await people.search('gmail');

    expect(result).toHaveLength(1);
    expect(result[0].resourceName).toBe('people/c1');
  });

  it('「その他の連絡先」の検索が失敗しても登録済み連絡先の結果は返る', async () => {
    const contact = contactPerson('Proxaxis', 'proxaxis.me@gmail.com');
    mocks.searchContacts.mockResolvedValue({ results: [{ person: contact }] });
    mocks.searchOtherContacts.mockRejectedValue(Object.assign(new Error('forbidden'), { status: 403 }));

    const { people } = await setupEnabled();
    const result = await people.search('gmail');

    expect(result).toHaveLength(1);
    expect(result[0].resourceName).toBe('people/c1');
  });

  it('登録済み連絡先の検索が失敗しても「その他の連絡先」の結果は返る', async () => {
    const other = otherContactPerson('Hosoda', 'hosoda.y.ml@gmail.com');
    mocks.searchContacts.mockRejectedValue(Object.assign(new Error('server error'), { status: 500 }));
    mocks.searchOtherContacts.mockResolvedValue({ results: [{ person: other }] });

    const { people } = await setupEnabled();
    const result = await people.search('gmail');

    expect(result).toHaveLength(1);
    expect(result[0].resourceName).toBe('otherContacts/c9');
  });

  it('両方の検索が失敗した場合は連絡先一覧へのフォールバックで絞り込む', async () => {
    const connection = contactPerson('Fallback User', 'fallback@gmail.com', 'people/c2');
    mocks.searchContacts.mockRejectedValue(new Error('fail'));
    mocks.searchOtherContacts.mockRejectedValue(new Error('fail'));
    mocks.listConnections.mockResolvedValue({ connections: [connection] });

    const { people } = await setupEnabled();
    const result = await people.search('gmail');

    expect(mocks.listConnections).toHaveBeenCalledTimes(1);
    expect(result.map((p) => p.resourceName)).toEqual(['people/c2']);
  });

  it('People API トークンが取得できない場合は API を呼ばず空を返す', async () => {
    mocks.ensurePeopleToken.mockResolvedValue(null);

    const { people } = await setupEnabled();
    const result = await people.search('gmail');

    expect(result).toEqual([]);
    expect(mocks.searchContacts).not.toHaveBeenCalled();
    expect(mocks.searchOtherContacts).not.toHaveBeenCalled();
  });

  it('連絡先連携が無効なら API を呼ばず空を返す', async () => {
    const { people, userStore } = await setupEnabled();
    userStore.setUsePeopleApi(false);

    const result = await people.search('gmail');

    expect(result).toEqual([]);
    expect(mocks.searchContacts).not.toHaveBeenCalled();
  });
});
