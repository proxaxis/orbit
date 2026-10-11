/**
 * フォーム内で Enter キーによるフォーカス移動を実現する DOM ヘルパー。
 * `data-enter-focus` 属性を持つ要素を順にたどる。
 */
import { useUserStore } from '@/stores/user.js';

/**
 * Enter キーでフォーム内の次の入力項目へフォーカスを移動する
 * @param {KeyboardEvent} keyboardEvent キーダウンイベント
 * @returns {void}
 */
export function focusNextOnEnter(keyboardEvent) {
  // IME 変換中や修飾キー付きの Enter は対象外（Ctrl+Enter はフォーム送信として扱う）
  if (keyboardEvent.isComposing || keyboardEvent.ctrlKey || keyboardEvent.metaKey) return;
  // デスクトップで Enter 送信が有効な場合はフォーカス移動せず、ブラウザの暗黙送信へ委ねる
  const userStore = useUserStore();
  if (userStore.isDesktop && userStore.formSubmitKey === 'ENTER') return;
  const current = keyboardEvent.currentTarget;
  if (!(current instanceof HTMLInputElement || current instanceof HTMLTextAreaElement || current instanceof HTMLButtonElement)) return;
  const form = current.form ?? current.closest('form');
  if (!form) return;
  const fields = Array.from(form.querySelectorAll('[data-enter-focus]'));
  const index = fields.indexOf(current);
  const next = fields[index + 1];
  if (!next) return;
  keyboardEvent.preventDefault();
  /** @type {HTMLElement} */ (next).focus();
}
