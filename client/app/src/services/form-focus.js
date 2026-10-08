/**
 * フォーム内で Enter キーによるフォーカス移動を実現する DOM ヘルパー。
 * `data-enter-focus` 属性を持つ要素を順にたどる。
 */

/**
 * Enter キーでフォーム内の次の入力項目へフォーカスを移動する
 * @param {KeyboardEvent} keyboardEvent キーダウンイベント
 * @returns {void}
 */
export function focusNextOnEnter(keyboardEvent) {
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
