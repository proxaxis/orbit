/**
 * Google People API を使った連絡先の検索を担うコンポーザブル。
 * 検索結果のメモリキャッシュとストアへの反映をここで行う。
 * People API はオプトイン機能のため、個人設定で有効化され
 * OAuth 認証が済んでいる場合だけ検索を実行する。
 */
import * as gPeopleAPI from '@/services/google-people-api.js';
import { useAuthStore } from '@/stores/auth.js';
import { usePeopleStore } from '@/stores/people.js';
import { useUserStore } from '@/stores/user.js';
import { useAuth } from '@/composables/useAuth.js';

/** @type {Map<string, GooglePeoplePerson[]>} 検索結果のメモリキャッシュ */
const searchCache = new Map();
/** @type {number} 実行中の検索を識別する世代番号（古い結果の上書き防止用） */
let searchGeneration = 0;

/** @type {number} 入力中の連続した検索リクエストをまとめるデバウンス時間 */
const SEARCH_DEBOUNCE_MS = 300;
/** @type {ReturnType<typeof setTimeout>|null} デバウンス用タイマー */
let searchDebounceTimer = null;
/** @type {((people: GooglePeoplePerson[]) => void)|null} 未実行の検索を待つ resolve */
let searchDebounceResolve = null;

/** @type {string} 検索時に取得する連絡先フィールド */
const SEARCH_READ_MASK = 'names,emailAddresses,photos,userDefined';

/**
 * 連絡先が検索文字列に一致するかを判定する
 * @param {GooglePeoplePerson} person 判定対象の連絡先
 * @param {string} needle 小文字化済みの検索文字列
 * @returns {boolean}
 */
function matchesSearchText(person, needle) {
  const name = person.names?.map((item) => item.displayName ?? '').join(' ') ?? '';
  const emails = person.emailAddresses?.map((item) => item.value).join(' ') ?? '';
  const labels = person.userDefined?.map((item) => `${item.key} ${item.value}`).join(' ') ?? '';
  return `${name} ${emails} ${labels}`.toLowerCase().includes(needle);
}

/**
 * 連絡先一覧から検索文字列に一致するものを抽出する
 * @param {GooglePeoplePerson[]} connections 連絡先一覧
 * @param {string} needle 小文字化済みの検索文字列
 * @returns {Promise<GooglePeoplePerson[]>} 一致した連絡先（最大10件）
 */
function filterConnections(connections, needle) {
  return connections.filter((person) => matchesSearchText(person, needle)).slice(0, 10);
}

/** 検索結果のメモリキャッシュを全て破棄する（アカウント切替時などに使用） */
export function resetSearchCache() {
  searchCache.clear();
}

/**
 * 連絡先の検索を提供するコンポーザブル
 * @returns {Object} 連絡先検索関数群
 */
export function usePeople() {
  const authStore = useAuthStore();
  const peopleStore = usePeopleStore();
  const userStore = useUserStore();
  const auth = useAuth();

  /**
   * 連絡先の検索を実行する本体（デバウンスなし）
   * @param {string} query 検索文字列
   * @returns {Promise<GooglePeoplePerson[]>} 候補一覧
   */
  async function searchNow(query) {
    const normalizedQuery = query.trim();
    const isLabelQuery = normalizedQuery.startsWith('@');
    const searchText = isLabelQuery ? normalizedQuery.slice(1).trim() : normalizedQuery;
    const generation = ++searchGeneration;
    if (!searchText || !authStore.token || !userStore.usePeopleApi || userStore.isOffline) {
      peopleStore.setSuggestions([]);
      return [];
    }
    // People API 用トークンは未認証なら null が返る（個人設定での有効化を促す）
    const token = authStore.peopleToken || (await auth.ensurePeopleToken());
    if (!token) {
      peopleStore.setSuggestions([]);
      return [];
    }
    const cacheKey = `${isLabelQuery ? '@' : ''}${searchText}`;
    if (searchCache.has(cacheKey)) {
      const cached = searchCache.get(cacheKey) ?? [];
      if (generation === searchGeneration) peopleStore.setSuggestions(cached);
      return cached;
    }

    const needle = searchText.toLowerCase();
    try {
      let people = [];
      if (!isLabelQuery) {
        const response = await gPeopleAPI.searchContacts(token, searchText, { readMask: SEARCH_READ_MASK, pageSize: 10 });
        people = (response?.results ?? [])
          .map((result) => result.person)
          .filter(Boolean)
          .filter((person) => matchesSearchText(person, needle));
      }
      if (!people.length) {
        const connections = await gPeopleAPI.listConnections(token, { personFields: SEARCH_READ_MASK, pageSize: 1000 });
        people = filterConnections(connections?.connections ?? [], needle);
      }
      searchCache.set(cacheKey, people);
      if (generation === searchGeneration) peopleStore.setSuggestions(people);
      return people;
    } catch {
      if (generation !== searchGeneration) return [];
      try {
        const connections = await gPeopleAPI.listConnections(token, { personFields: SEARCH_READ_MASK, pageSize: 1000 });
        const people = filterConnections(connections?.connections ?? [], needle);
        searchCache.set(cacheKey, people);
        peopleStore.setSuggestions(people);
        return people;
      } catch (fallbackError) {
        userStore.setError(true, fallbackError);
        peopleStore.setSuggestions([]);
        return [];
      }
    }
  }

  /**
   * People API から連絡先候補を検索する。
   * 先頭に '@' を付けるとラベル検索として接続先全体から絞り込む。
   * 連絡先連携が無効（または未認証）の場合は API を呼ばず空を返す。
   * キー入力ごとの API 連発を避けるためデバウンスし、直前の未実行リクエストは打ち切る。
   * @param {string} query 名前またはメールアドレスの検索文字列
   * @returns {Promise<GooglePeoplePerson[]>} 候補一覧
   */
  function search(query) {
    if (searchDebounceTimer) {
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = null;
      // 打ち切られた呼び出し側は空結果で解決する（サジェストは世代番号で上書き防止済み）
      searchDebounceResolve?.([]);
      searchDebounceResolve = null;
    }
    return new Promise((resolve) => {
      searchDebounceResolve = resolve;
      searchDebounceTimer = setTimeout(async () => {
        searchDebounceTimer = null;
        searchDebounceResolve = null;
        resolve(await searchNow(query));
      }, SEARCH_DEBOUNCE_MS);
    });
  }

  return { search };
}
