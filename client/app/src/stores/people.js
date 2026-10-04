import { defineStore } from 'pinia';
import { ref } from 'vue';
import { useAuthStore } from '@/stores/auth.js';
import { useUserStore } from '@/stores/user.js';
import * as gPeopleAPI from '@/services/google-people-api.js';
import { readOffline, writeOffline } from '@/services/offline-storage.js';

export const usePeopleStore = defineStore('people', () => {
  const authStore = useAuthStore();
  /** @type {Ref<GooglePeoplePerson[]>} 検索結果 */
  const suggestions = ref([]);
  /** @type {Ref<string[]>} イベント保存後に登録するメールアドレス */
  const pendingRegistrationEmails = ref([]);
  /** @type {Map<string, GooglePeoplePerson[]>} 検索結果のメモリキャッシュ */
  const cache = new Map();
  let searchGeneration = 0;

  /**
   * People API から連絡先候補を検索します。
   * @param {string} query 名前またはメールアドレスの検索文字列
   * @returns {Promise<GooglePeoplePerson[]>} 候補一覧
   */
  async function search(query) {
    const normalizedQuery = query.trim();
    const isLabelQuery = normalizedQuery.startsWith('@');
    const searchText = isLabelQuery ? normalizedQuery.slice(1).trim() : normalizedQuery;
    const generation = ++searchGeneration;
    if (!searchText || !authStore.token) {
      suggestions.value = [];
      return [];
    }
    const cacheKey = `${isLabelQuery ? '@' : ''}${searchText}`;
    if (cache.has(cacheKey)) {
      if (generation === searchGeneration) suggestions.value = cache.get(cacheKey) ?? [];
      return suggestions.value;
    }

    try {
      const response = isLabelQuery
        ? null
        : await gPeopleAPI.searchContacts(authStore.token, searchText, {
            readMask: 'names,emailAddresses,photos,userDefined',
            pageSize: 10,
          });
      let people = (response?.results ?? []).map((result) => result.person).filter(Boolean);
      const needle = searchText.toLowerCase();
      const matches = (person) => {
        const name = person.names?.map((item) => item.displayName ?? '').join(' ') ?? '';
        const emails = person.emailAddresses?.map((item) => item.value).join(' ') ?? '';
        const labels = person.userDefined?.map((item) => `${item.key} ${item.value}`).join(' ') ?? '';
        return `${name} ${emails} ${labels}`.toLowerCase().includes(needle);
      };
      people = people.filter(matches);
      if (!people.length) {
        const connections = await gPeopleAPI.listConnections(authStore.token, {
          personFields: 'names,emailAddresses,photos,userDefined',
          pageSize: 1000,
        });
        people = (connections?.connections ?? []).filter(matches).slice(0, 10);
      }
      cache.set(cacheKey, people);
      if (generation === searchGeneration) suggestions.value = people;
      return people;
    } catch (error) {
      if (generation === searchGeneration) {
        try {
          const connections = await gPeopleAPI.listConnections(authStore.token, {
            personFields: 'names,emailAddresses,photos,userDefined',
            pageSize: 1000,
          });
          const needle = searchText.toLowerCase();
          const people = (connections?.connections ?? [])
            .filter((person) => {
              const name = person.names?.map((item) => item.displayName ?? '').join(' ') ?? '';
              const emails = person.emailAddresses?.map((item) => item.value).join(' ') ?? '';
              const labels = person.userDefined?.map((item) => `${item.key} ${item.value}`).join(' ') ?? '';
              return `${name} ${emails} ${labels}`.toLowerCase().includes(needle);
            })
            .slice(0, 10);
          cache.set(cacheKey, people);
          suggestions.value = people;
        } catch (fallbackError) {
          userStore.setError(true, fallbackError);
          suggestions.value = [];
        }
      }
      return [];
    }
  }

  /** 候補一覧を消去します。 */
  function clearSuggestions() {
    suggestions.value = [];
  }

  /** @param {string[]} emails PeopleEditor へ渡す登録対象を設定します。 */
  function setPendingRegistrationEmails(emails) {
    pendingRegistrationEmails.value = [...new Set(emails.filter((email) => typeof email === 'string' && email.trim()))];
  }

  /** PeopleEditor 表示後に登録対象を消費します。 */
  function clearPendingRegistrationEmails() {
    pendingRegistrationEmails.value = [];
  }

  /**
   * People API に新しい連絡先を作成します。
   * @param {{email: string, displayName: string, phoneticName: string, birthday: string, label: string}} input 連絡先情報
   * @returns {Promise<GooglePeoplePerson>} 作成された連絡先
   */
  async function createPerson(input) {
    if (!authStore.token) throw new Error('Google アカウントでログインしてください。');
    const body = {
      names: [{ displayName: input.displayName, phoneticFullName: input.phoneticName || undefined }],
      emailAddresses: [{ value: input.email }],
      ...(input.birthday ? { birthdays: [{ date: parseBirthday(input.birthday) }] } : {}),
      ...(input.label ? { userDefined: [{ key: 'label', value: input.label }] } : {}),
    };
    return gPeopleAPI.createContact(authStore.token, body, { personFields: 'names,emailAddresses,birthdays,userDefined' });
  }

  /** @param {string} value YYYY-MM-DD の誕生日を People API 形式へ変換します。 */
  function parseBirthday(value) {
    const [year, month, day] = value.split('-').map(Number);
    return { year, month, day };
  }

  return { suggestions, search, clearSuggestions, pendingRegistrationEmails, setPendingRegistrationEmails, clearPendingRegistrationEmails, createPerson };
});
