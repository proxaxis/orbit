/**
 * 連絡先検索の状態管理のみを担当するストア。
 * Google People API との通信は `composables/usePeople.js` に置く。
 */
import { defineStore } from 'pinia';
import { ref } from 'vue';

export const usePeopleStore = defineStore('people', () => {
  /** @type {Ref<GooglePeoplePerson[]>} @description 検索結果の候補一覧 */
  const suggestions = ref([]);

  /**
   * 検索結果の候補一覧を設定する
   * @param {GooglePeoplePerson[]} items 候補一覧
   * @returns {void}
   */
  function setSuggestions(items) {
    suggestions.value = Array.isArray(items) ? items : [];
  }

  /** 候補一覧を消去する */
  function clearSuggestions() {
    suggestions.value = [];
  }

  return {
    suggestions,
    setSuggestions,
    clearSuggestions,
  };
});
