/**
 * ユーザー設定に基づくテーマ・フォントの DOM 反映を担うコンポーザブル。
 * 状態の保持は `stores/user.js`、ここでは CSS 変数やクラスへの適用のみを行う。
 */
import { DEFAULT_THEME_COLOR, USER_FONT_FAMILIES, USER_TEXT_SIZE_VALUES, useUserStore } from '@/stores/user.js';

/**
 * テーマ関連の DOM 適用を提供するコンポーザブル
 * @returns {Object} テーマ適用関数群
 */
export function useTheme() {
  const userStore = useUserStore();

  /**
   * テーマを更新して DOM に反映する
   * @param {'LIGHT'|'DARK'|'SYSTEM'} newTheme 適用するテーマ
   * @returns {void}
   */
  function applyTheme(newTheme) {
    userStore.setTheme(newTheme);

    if (typeof document === 'undefined') return console.warn('applyTheme called in a non-browser environment. DOM manipulation is skipped.');

    // Tailwind CSS 等の 'dark' クラス運用に対応
    if (userStore.theme === 'DARK') document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');

    document.documentElement.setAttribute('data-theme', userStore.theme.toLowerCase());
  }

  /**
   * テーマカラーを CSS 変数へ反映する
   * @param {string} [color] 適用するテーマカラー（省略時は保存済みの値）
   * @returns {void}
   */
  function applyThemeColor(color) {
    if (typeof color === 'string') userStore.setThemeColor(color);
    if (typeof document === 'undefined') return;
    const resolved = /^#[0-9a-fA-F]{6}$/.test(userStore.themeColor) ? userStore.themeColor : DEFAULT_THEME_COLOR;
    document.documentElement.style.setProperty('--primary', resolved);
    document.documentElement.style.setProperty('--primary-light', `color-mix(in srgb, ${resolved} 55%, transparent)`);
    document.documentElement.style.setProperty('--selected', `color-mix(in srgb, ${resolved} 35%, transparent)`);
  }

  /**
   * 選択中のフォントを CSS 変数へ反映する
   * @returns {void}
   */
  function applyFonts() {
    if (typeof document === 'undefined') return;
    document.documentElement.style.setProperty('--ui-font-family', USER_FONT_FAMILIES[userStore.uiFontFamily]);
    document.documentElement.style.setProperty('--calendar-font-family', USER_FONT_FAMILIES[userStore.calendarFontFamily]);
  }

  /**
   * 選択中の通常 UI の文字サイズを CSS 変数へ反映する
   * @returns {void}
   */
  function applyTextSizes() {
    if (typeof document === 'undefined') return;
    const sizes = USER_TEXT_SIZE_VALUES[userStore.uiTextSize];
    Object.entries(sizes).forEach(([name, value]) => document.documentElement.style.setProperty(`--text-size-${name}`, value));
  }

  /**
   * 保存済みのテーマ・フォント設定を全て DOM へ反映する
   * @returns {void}
   */
  function applyAllAppearance() {
    applyTheme(userStore.userSelectedTheme);
    applyThemeColor();
    applyFonts();
    applyTextSizes();
  }

  return {
    applyTheme,
    applyThemeColor,
    applyFonts,
    applyTextSizes,
    applyAllAppearance,
  };
}
